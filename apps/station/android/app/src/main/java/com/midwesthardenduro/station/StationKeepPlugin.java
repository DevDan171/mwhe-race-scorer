package com.midwesthardenduro.station;

import android.Manifest;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.view.WindowManager;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "StationKeep",
    permissions = { @Permission(strings = { Manifest.permission.CAMERA }, alias = "camera") }
)
public class StationKeepPlugin extends Plugin {
    @PluginMethod
    public void start(PluginCall call) {
        String title = call.getString("title", "MWHE Station is recording");
        String body = call.getString("body", "Punches stay on this phone.");
        Intent intent = new Intent(getContext(), StationForegroundService.class);
        intent.putExtra("title", title);
        intent.putExtra("body", body);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(intent);
        } else {
            getContext().startService(intent);
        }
        if (getActivity() != null) {
            getActivity().runOnUiThread(() -> getActivity()
                .getWindow()
                .addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON));
        }
        askToIgnoreBatteryOptimizations();
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getContext().stopService(new Intent(getContext(), StationForegroundService.class));
        if (getActivity() != null) {
            getActivity().runOnUiThread(() -> getActivity()
                .getWindow()
                .clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON));
        }
        call.resolve();
    }

    @PluginMethod
    public void ensureCamera(PluginCall call) {
        if (getPermissionState("camera") == PermissionState.GRANTED) {
            call.resolve();
            return;
        }
        requestPermissionForAlias("camera", call, "cameraPermsCallback");
    }

    @PermissionCallback
    private void cameraPermsCallback(PluginCall call) {
        if (getPermissionState("camera") == PermissionState.GRANTED) {
            call.resolve();
        } else {
            call.reject("Camera permission is needed to scan a code.");
        }
    }

    private void askToIgnoreBatteryOptimizations() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return;
        PowerManager manager = (PowerManager) getContext().getSystemService(android.content.Context.POWER_SERVICE);
        String pkg = getContext().getPackageName();
        if (manager != null && !manager.isIgnoringBatteryOptimizations(pkg)) {
            Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            intent.setData(Uri.parse("package:" + pkg));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        }
    }
}
