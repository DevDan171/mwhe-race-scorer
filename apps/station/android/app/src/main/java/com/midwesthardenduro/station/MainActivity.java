package com.midwesthardenduro.station;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(StationKeepPlugin.class);
        registerPlugin(StationUpdatePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
