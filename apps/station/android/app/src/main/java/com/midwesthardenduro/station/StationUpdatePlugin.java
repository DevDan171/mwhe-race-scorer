package com.midwesthardenduro.station;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;

/**
 * Opens Android's package installer. This does not install by itself.
 * Android rejects the APK when its signing certificate does not match the
 * app already on the phone. Debug builds are signed with a throwaway key,
 * so they cannot update each other.
 */
@CapacitorPlugin(name = "StationUpdate")
public class StationUpdatePlugin extends Plugin {
    @PluginMethod
    public void install(PluginCall call) {
        String relative = call.getString("path", "updates/station-update.apk");
        if (relative == null || relative.contains("..")) {
            call.reject("That update path is not allowed.");
            return;
        }
        File file = new File(getContext().getCacheDir(), relative);
        if (!file.isFile()) {
            call.reject("The update file is not on this phone.");
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            && !getContext().getPackageManager().canRequestPackageInstalls()) {
            Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
            settings.setData(Uri.parse("package:" + getContext().getPackageName()));
            settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(settings);
            call.reject("Allow this app to install updates, then tap Install again.");
            return;
        }
        Uri uri = FileProvider.getUriForFile(
            getContext(),
            getContext().getPackageName() + ".fileprovider",
            file
        );
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(uri, "application/vnd.android.package-archive");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }
}
