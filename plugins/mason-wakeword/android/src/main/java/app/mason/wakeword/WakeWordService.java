package app.mason.wakeword;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.provider.Settings;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import org.json.JSONArray;
import org.json.JSONObject;
import org.vosk.Model;
import org.vosk.Recognizer;
import org.vosk.android.RecognitionListener;
import org.vosk.android.SpeechService;
import org.vosk.android.StorageService;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Serviço em primeiro plano que fica ouvindo a palavra de ativação ("MASON") com o Vosk, 100% offline.
 * Ao detectar: solta o microfone, traz o app para a frente e avisa o JavaScript.
 * O JavaScript chama resume() quando a conversa termina, e a escuta volta.
 */
public class WakeWordService extends Service implements RecognitionListener {
    static final String TAG = "MasonWake";
    static final String ACTION_START = "start";
    static final String ACTION_STOP = "stop";
    static final String ACTION_PAUSE = "pause";
    static final String ACTION_RESUME = "resume";
    static final String ACTION_CALIBRATE = "calibrate";
    static final String EXTRA_TRIGGERS = "triggers";
    static final String EXTRA_GRAMMAR = "grammar";
    static final String EXTRA_WAKE = "mason_wake";

    private static final String CHANNEL = "mason_wake_listen";
    private static final String CHANNEL_ALERT = "mason_wake_alert";
    private static final int NOTIF_ID = 4711;
    private static final int ALERT_ID = 4712;

    static volatile boolean running = false;
    static volatile boolean listening = false;
    static volatile boolean modelReady = false;
    static volatile String lastError = null;

    private Model model;
    private SpeechService speech;
    private final List<String> triggers = new ArrayList<>();
    private boolean grammarMode = false;
    private boolean calibrating = false;
    private boolean paused = false;
    private long lastWake = 0;
    private final Handler handler = new Handler(Looper.getMainLooper());

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null && intent.getAction() != null ? intent.getAction() : ACTION_START;
        switch (action) {
            case ACTION_STOP:
                if (intent != null && intent.getBooleanExtra("fromNotification", false)) {
                    getSharedPreferences("mason_wake", MODE_PRIVATE).edit().putBoolean("userStopped", true).apply();
                }
                shutdown();
                return START_NOT_STICKY;
            case ACTION_PAUSE:
                paused = true;
                stopListening();
                updateNotification("Em pausa durante a conversa");
                return START_STICKY;
            case ACTION_RESUME:
                paused = false;
                calibrating = false;
                startListening();
                return START_STICKY;
            case ACTION_CALIBRATE:
                calibrating = true;
                paused = false;
                grammarMode = false; // calibração usa reconhecimento livre para ver como ele ouve "MASON"
                restartListening();
                return START_STICKY;
            default:
                ArrayList<String> t = intent != null ? intent.getStringArrayListExtra(EXTRA_TRIGGERS) : null;
                triggers.clear();
                if (t != null) for (String s : t) triggers.add(fold(s));
                grammarMode = intent != null && intent.getBooleanExtra(EXTRA_GRAMMAR, false) && !triggers.isEmpty();
                calibrating = false;
                paused = false;
                goForeground();
                running = true;
                if (model == null) loadModel(); else restartListening();
                return START_STICKY;
        }
    }

    private void goForeground() {
        createChannels();
        Notification n = buildNotification("Diga \"MASON\" para chamar");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
        } else {
            startForeground(NOTIF_ID, n);
        }
    }

    private void loadModel() {
        updateNotification("Preparando o reconhecimento…");
        StorageService.unpack(this, "model-pt", "model",
            (Model m) -> {
                model = m;
                modelReady = true;
                lastError = null;
                if (!paused) startListening();
            },
            (java.io.IOException e) -> {
                lastError = "Modelo de voz não carregou: " + e.getMessage();
                Log.e(TAG, lastError, e);
                updateNotification("Erro ao preparar o reconhecimento");
            });
    }

    private void startListening() {
        if (model == null || speech != null || paused) return;
        try {
            Recognizer rec;
            if (grammarMode && !calibrating) {
                JSONArray g = new JSONArray();
                for (String s : triggers) g.put(s);
                g.put("[unk]");
                rec = new Recognizer(model, 16000.0f, g.toString());
            } else {
                rec = new Recognizer(model, 16000.0f);
            }
            speech = new SpeechService(rec, 16000.0f);
            speech.startListening(this);
            listening = true;
            lastError = null;
            updateNotification(calibrating ? "Calibrando: diga \"MASON\"" : "Diga \"MASON\" para chamar");
        } catch (Exception e) {
            lastError = "Não consegui usar o microfone: " + e.getMessage();
            Log.e(TAG, lastError, e);
            speech = null;
            listening = false;
            // tenta de novo daqui a pouco (o microfone pode estar com outro app)
            handler.postDelayed(this::startListening, 4000);
        }
    }

    private void stopListening() {
        handler.removeCallbacksAndMessages(null);
        if (speech != null) {
            try { speech.stop(); speech.shutdown(); } catch (Exception ignored) { }
            speech = null;
        }
        listening = false;
    }

    private void restartListening() {
        stopListening();
        startListening();
    }

    private void shutdown() {
        stopListening();
        running = false;
        stopForeground(true);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        stopListening();
        running = false;
        if (model != null) { model.close(); model = null; modelReady = false; }
        super.onDestroy();
    }

    /* ---------------- Reconhecimento ---------------- */

    @Override
    public void onPartialResult(String hypothesis) {
        if (calibrating) return;
        check(field(hypothesis, "partial"));
    }

    @Override
    public void onResult(String hypothesis) {
        String text = field(hypothesis, "text");
        if (calibrating) {
            if (!text.isEmpty()) WakeWordPlugin.emitHeard(text);
            return;
        }
        check(text);
    }

    @Override
    public void onFinalResult(String hypothesis) { onResult(hypothesis); }

    @Override
    public void onError(Exception e) {
        lastError = e.getMessage();
        Log.e(TAG, "Erro no reconhecimento", e);
        restartLater();
    }

    @Override
    public void onTimeout() { restartLater(); }

    private void restartLater() {
        stopListening();
        handler.postDelayed(this::startListening, 1500);
    }

    private void check(String text) {
        if (text == null || text.isEmpty() || triggers.isEmpty()) return;
        String t = " " + fold(text) + " ";
        for (String trig : triggers) {
            if (!trig.isEmpty() && t.contains(" " + trig + " ")) {
                wake();
                return;
            }
        }
    }

    private void wake() {
        long now = System.currentTimeMillis();
        if (now - lastWake < 3000) return;
        lastWake = now;
        paused = true;
        stopListening(); // solta o microfone para o reconhecimento da conversa
        updateNotification("Chamado! Conversa em andamento");

        Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (launch != null) {
            launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
            launch.putExtra(EXTRA_WAKE, true);
            boolean canPopUp = Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(this);
            if (canPopUp) {
                try { startActivity(launch); } catch (Exception e) { Log.w(TAG, "Não abriu a tela", e); showAlert(launch); }
            } else {
                showAlert(launch);
            }
        }
        WakeWordPlugin.emitWake();
    }

    /** Sem permissão para abrir sozinho: notificação de destaque que abre a conversa. */
    private void showAlert(Intent launch) {
        PendingIntent pi = PendingIntent.getActivity(this, 2, launch, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification n = new NotificationCompat.Builder(this, CHANNEL_ALERT)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentTitle("MASON")
            .setContentText("Estou ouvindo. Toque para conversar.")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setAutoCancel(true)
            .setContentIntent(pi)
            .setFullScreenIntent(pi, true)
            .build();
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        nm.notify(ALERT_ID, n);
    }

    static void cancelAlert(Context ctx) {
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(ALERT_ID);
    }

    /* ---------------- Notificações ---------------- */

    private void createChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        NotificationChannel listen = new NotificationChannel(CHANNEL, "MASON ouvindo", NotificationManager.IMPORTANCE_LOW);
        listen.setDescription("Aparece enquanto o MASON escuta a palavra de ativação");
        listen.setShowBadge(false);
        nm.createNotificationChannel(listen);
        NotificationChannel alert = new NotificationChannel(CHANNEL_ALERT, "MASON chamado", NotificationManager.IMPORTANCE_HIGH);
        alert.setDescription("Quando você chama o MASON pela voz");
        nm.createNotificationChannel(alert);
    }

    private Notification buildNotification(String text) {
        Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent pi = open == null ? null : PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Intent stop = new Intent(this, WakeWordService.class).setAction(ACTION_STOP).putExtra("fromNotification", true);
        PendingIntent stopPi = PendingIntent.getService(this, 1, stop, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentTitle("MASON")
            .setContentText(text)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .addAction(0, "Desligar", stopPi);
        if (pi != null) b.setContentIntent(pi);
        return b.build();
    }

    private void updateNotification(String text) {
        if (!running) return;
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        nm.notify(NOTIF_ID, buildNotification(text));
    }

    /* ---------------- Utilidades ---------------- */

    static String fold(String s) {
        String n = Normalizer.normalize(s.toLowerCase(Locale.ROOT), Normalizer.Form.NFD).replaceAll("\\p{M}", "");
        return n.replaceAll("[^a-z0-9 ]", " ").replaceAll("\\s+", " ").trim();
    }

    private static String field(String json, String key) {
        try { return new JSONObject(json).optString(key, ""); } catch (Exception e) { return ""; }
    }
}
