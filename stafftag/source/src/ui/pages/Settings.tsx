import { React, ReactNative } from "@vendetta/metro/common";
import { storage } from "@vendetta/plugin";
import { useProxy } from "@vendetta/storage";

export default function Settings() {
    useProxy(storage);
    const View = ReactNative?.View;
    const Text = ReactNative?.Text;
    const Switch = ReactNative?.Switch;
    if (!View || !Text || !Switch || typeof React?.createElement !== "function") return null;

    return React.createElement(View, { style: { paddingHorizontal: 16, paddingVertical: 12 } },
        React.createElement(Text, { style: { color: "#B5BAC1", fontSize: 14, fontWeight: "700", marginBottom: 8 } }, "TAG STYLE"),
        React.createElement(View, { style: { minHeight: 68, flexDirection: "row", alignItems: "center" } },
            React.createElement(View, { style: { flex: 1, paddingRight: 12 } },
                React.createElement(Text, { style: { color: "white", fontSize: 16, fontWeight: "600" } }, "Use top role color for tag backgrounds")
            ),
            React.createElement(Switch, {
                value: Boolean(storage.useRoleColor),
                onValueChange: (value: boolean) => { storage.useRoleColor = value; }
            })
        )
    );
}
