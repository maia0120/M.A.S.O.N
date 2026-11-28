package app.mason.wakeword;

import android.Manifest;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

import java.util.ArrayList;

/**
 * Reconhecimento de fala da conversa, com controle total (substitui o plugin genérico).
 * - pt-BR, resultado FINAL (mais preciso que o parcial), até 5 alternativas com confiança;
 * - mais tolerância a pausas naturais (quando o reconhecedor do aparelho respeita esses ajustes);
 * - antes de ouvir, pede ao serviço da palavra de ativação para soltar o microfone e ESPERA a confirmação;
 * - uma sessão por vez; erros devolvidos com código, sem travar.
 */
@CapacitorPlugin(
    name = "MasonSpeech",
    permissions = { @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO }) }
)
public class MasonSpeechPlugin extends Plugin implements RecognitionListener {
    private final Handler main = new Handler(Looper.getMainLooper());
    private SpeechRecognizer recognizer;
    private PluginCall active;
    private long lastLevelAt = 0;
    private boolean retried = false;
    private Intent lastIntent;

    @PluginMethod
    public void available(PluginCall call) {
        JSObject o = new JSObject();
        o.put("available", SpeechRecognizer.isRecognitionAvailable(getContext()));
        call.resolve(o);
    }

    @PluginMethod
    public void listen(PluginCall call) {
        if (active != null) {
            call.reject("Já existe uma escuta em andamento.", "busy");
            return;
        }
        active = call;
        retried = false;
        int silenceMs = call.getInt("silenceMs", 2000);
        int minMs = call.getInt("minMs", 1500);
        String lang = call.getString("lang", "pt-BR");
        Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, lang);
        i.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 5);
        i.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getContext().getPackageName());
        i.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, (long) silenceMs);
        i.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, (long) Math.max(800, silenceMs - 500));
        i.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, (long) minMs);
        lastIntent = i;
        releaseWakeThen(() -> startRecognizer(i), 0);
    }

    /** Pede ao serviço da palavra de ativação para soltar o microfone e espera até 1,5 s pela confirmação. */
    private void releaseWakeThen(Runnable next, int waitedMs) {
        if (waitedMs == 0 && WakeWordService.running && WakeWordService.listening) {
            Intent p = new Intent(getContext(), WakeWordService.class).setAction(WakeWordService.ACTION_PAUSE);
            try { getContext().startService(p); } catch (Exception ignored) { }
        }
        if (WakeWordService.listening && waitedMs < 1500) {
            main.postDelayed(() -> releaseWakeThen(next, waitedMs + 50), 50);
            return;
        }
        // pequena folga para o AudioRecord do Vosk ser liberado de fato
        main.postDelayed(next, waitedMs > 0 ? 150 : 0);
    }

    private void startRecognizer(Intent i) {
        main.post(() -> {
            try {
                destroyRecognizer();
                recognizer = SpeechRecognizer.createSpeechRecognizer(getContext());
                recognizer.setRecognitionListener(this);
                recognizer.startListening(i);
                emitState("starting");
            } catch (Exception e) {
                finish(null, "start_failed", e.getMessage());
            }
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        main.post(() -> { if (recognizer != null) recognizer.stopListening(); });
        call.resolve();
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        main.post(() -> {
            if (recognizer != null) recognizer.cancel();
            finish(null, "cancelled", null);
        });
        call.resolve();
    }

    private void destroyRecognizer() {
        if (recognizer != null) {
            try { recognizer.destroy(); } catch (Exception ignored) { }
            recognizer = null;
        }
    }

    private void emitState(String s) {
        JSObject o = new JSObject();
        o.put("state", s);
        notifyListeners("state", o);
    }

    private void finish(Bundle results, String error, String detail) {
        PluginCall call = active;
        active = null;
        main.post(this::destroyRecognizer);
        if (call == null) return;
        JSObject o = new JSObject();
        JSArray alts = new JSArray();
        if (results != null) {
            ArrayList<String> texts = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
            float[] conf = results.getFloatArray(SpeechRecognizer.CONFIDENCE_SCORES);
            if (texts != null) {
                for (int k = 0; k < texts.size(); k++) {
                    JSObject a = new JSObject();
                    a.put("text", texts.get(k));
                    a.put("confidence", conf != null && k < conf.length ? (double) conf[k] : -1.0);
                    alts.put(a);
                }
            }
        }
        o.put("alternatives", alts);
        if (error != null) o.put("error", error);
        if (detail != null) o.put("detail", detail);
        call.resolve(o);
    }

    /* -------- RecognitionListener -------- */

    @Override public void onReadyForSpeech(Bundle params) { emitState("ready"); }
    @Override public void onBeginningOfSpeech() { emitState("speech"); }
    @Override public void onEndOfSpeech() { emitState("end"); }
    @Override public void onBufferReceived(byte[] buffer) { }
    @Override public void onEvent(int eventType, Bundle params) { }

    @Override
    public void onRmsChanged(float rmsdB) {
        long now = System.currentTimeMillis();
        if (now - lastLevelAt < 90) return;
        lastLevelAt = now;
        JSObject o = new JSObject();
        o.put("level", (double) Math.max(0f, Math.min(1f, (rmsdB + 2f) / 12f)));
        notifyListeners("level", o);
    }

    @Override
    public void onPartialResults(Bundle partial) {
        ArrayList<String> t = partial.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        if (t != null && !t.isEmpty() && t.get(0) != null && !t.get(0).isEmpty()) {
            JSObject o = new JSObject();
            o.put("text", t.get(0));
            notifyListeners("partial", o);
        }
    }

    @Override
    public void onResults(Bundle results) { finish(results, null, null); }

    @Override
    public void onError(int error) {
        // Microfone ocupado/erro de áudio logo no início: tenta uma vez de novo (o Vosk pode estar soltando).
        if (!retried && active != null && (error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY || error == SpeechRecognizer.ERROR_AUDIO || error == SpeechRecognizer.ERROR_CLIENT)) {
            retried = true;
            main.postDelayed(() -> { if (active != null && lastIntent != null) startRecognizer(lastIntent); }, 450);
            return;
        }
        finish(null, codeOf(error), null);
    }

    private static String codeOf(int e) {
        switch (e) {
            case SpeechRecognizer.ERROR_NO_MATCH: return "no_match";
            case SpeechRecognizer.ERROR_SPEECH_TIMEOUT: return "silence";
            case SpeechRecognizer.ERROR_AUDIO: return "audio";
            case SpeechRecognizer.ERROR_RECOGNIZER_BUSY: return "busy";
            case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS: return "permission";
            case SpeechRecognizer.ERROR_NETWORK:
            case SpeechRecognizer.ERROR_NETWORK_TIMEOUT: return "network";
            case SpeechRecognizer.ERROR_SERVER: return "server";
            case SpeechRecognizer.ERROR_CLIENT: return "client";
            default: return "error_" + e;
        }
    }

    @Override
    protected void handleOnDestroy() {
        main.post(this::destroyRecognizer);
        super.handleOnDestroy();
    }
}
