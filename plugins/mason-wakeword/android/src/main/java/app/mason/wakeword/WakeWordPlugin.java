package app.mason.wakeword;

import android.Manifest;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

import java.util.ArrayList;

/** Ponte entre o JavaScript do MASON e o serviço de palavra de ativação. */
@CapacitorPlugin(
    name = "MasonWakeWord",
    permissions = {
        @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO }),
        @Permission(alias = "notifications", strings = { "android.permission.POST_NOTIFICATIONS" })
    }
)
public class WakeWordPlugin extends Plugin {
    private static WakeWordPlugin instance;
    private boolean pendingLaunchWake = false;

    @Override
    public void load() {
        instance = this;
        Intent i = getActivity().getIntent();
        if (i != null && i.getBooleanExtra(WakeWordService.EXTRA_WAKE, false)) {
            pendingLaunchWake = true;
            i.removeExtra(WakeWordService.EXTRA_WAKE);
        }
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        if (intent != null && intent.getBooleanExtra(WakeWordService.EXTRA_WAKE, false)) {
            intent.removeExtra(WakeWordService.EXTRA_WAKE);
            WakeWordService.cancelAlert(getContext());
            notifyListeners("wake", new JSObject(), true);
        }
    }

    static void emitWake() {
        WakeWordPlugin p = instance;
        if (p != null && p.getBridge() != null) {
            p.getBridge().executeOnMainThread(() -> p.notifyListeners("wake", new JSObject(), true));
        }
    }

    static void emitHeard(String text) {
        WakeWordPlugin p = instance;
        if (p != null && p.getBridge() != null) {
            JSObject o = new JSObject();
            o.put("text", text);
            p.getBridge().executeOnMainThread(() -> p.notifyListeners("heard", o));
        }
    }

    private void send(String action, Intent extras) {
        Intent i = extras != null ? extras : new Intent();
        i.setClass(getContext(), WakeWordService.class);
        i.setAction(action);
        if (WakeWordService.ACTION_START.equals(action) && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ContextCompat.startForegroundService(getContext(), i);
        } else {
            getContext().startService(i);
        }
    }

    @PluginMethod
    public void start(PluginCall call) {
        ArrayList<String> triggers = new ArrayList<>();
        JSArray arr = call.getArray("triggers", new JSArray());
        try { for (Object o : arr.toList()) triggers.add(String.valueOf(o)); } catch (Exception ignored) { }
        Intent i = new Intent();
        i.putStringArrayListExtra(WakeWordService.EXTRA_TRIGGERS, triggers);
        i.putExtra(WakeWordService.EXTRA_GRAMMAR, Boolean.TRUE.equals(call.getBoolean("grammar", false)));
        try {
            send(WakeWordService.ACTION_START, i);
            call.resolve();
        } catch (Exception e) {
            call.reject("Não foi possível iniciar a escuta: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        if (WakeWordService.running) send(WakeWordService.ACTION_STOP, null);
        call.resolve();
    }

    @PluginMethod
    public void pause(PluginCall call) {
        if (WakeWordService.running) send(WakeWordService.ACTION_PAUSE, null);
        call.resolve();
    }

    @PluginMethod
    public void resume(PluginCall call) {
        if (WakeWordService.running) send(WakeWordService.ACTION_RESUME, null);
        call.resolve();
    }

    @PluginMethod
    public void calibrate(PluginCall call) {
        if (!WakeWordService.running) { call.reject("Ligue a ativação por voz antes de calibrar."); return; }
        send(WakeWordService.ACTION_CALIBRATE, null);
        call.resolve();
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject o = new JSObject();
        o.put("running", WakeWordService.running);
        o.put("listening", WakeWordService.listening);
        o.put("modelReady", WakeWordService.modelReady);
        o.put("error", WakeWordService.lastError);
        o.put("canDrawOverlays", Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(getContext()));
        android.content.SharedPreferences sp = getContext().getSharedPreferences("mason_wake", android.content.Context.MODE_PRIVATE);
        o.put("userStopped", sp.getBoolean("userStopped", false));
        sp.edit().remove("userStopped").apply();
        call.resolve(o);
    }

    /** O app foi aberto por uma chamada de voz? (lê e zera) */
    @PluginMethod
    public void consumeLaunchWake(PluginCall call) {
        JSObject o = new JSObject();
        o.put("wake", pendingLaunchWake);
        pendingLaunchWake = false;
        call.resolve(o);
    }

    @PluginMethod
    public void openOverlaySettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Intent i = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        }
        call.resolve();
    }
}
