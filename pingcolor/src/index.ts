import { findByTypeNameAll } from "@vendetta/metro";
import { React, ReactNative } from "@vendetta/metro/common";
import { after } from "@vendetta/patcher";
import { storage } from "@vendetta/plugin";
import { useProxy } from "@vendetta/storage";
import { findInReactTree } from "@vendetta/utils";

let unpatches: Array<() => void> = [];
let patchTimer: ReturnType<typeof setTimeout> | undefined;

function hex(v: string): string {
    return v.startsWith("#") ? v : `#${v}`;
}

function Settings() {
    useProxy(storage);
    const View = ReactNative?.View;
    const Text = ReactNative?.Text;
    const TextInput = ReactNative?.TextInput;
    if (!View || !Text || !TextInput || typeof React?.createElement !== "function") return null;

    const colorRow = (label: string, key: string) =>
        React.createElement(View, {
            key,
            style: { minHeight: 72, flexDirection: "row", alignItems: "center", marginBottom: 8 }
        },
            React.createElement(View, { style: { flex: 1, paddingRight: 12 } },
                React.createElement(Text, { style: { color: "white", fontSize: 16, fontWeight: "600" } }, label)
            ),
            React.createElement(View, {
                style: {
                    width: 24, height: 24, b
    ],
    "main": "src/index.ts"
}

src/index.ts
 from "@vendetta/storage";
import { findInReactTree } from "@vendetta/utils";

let unpatches: Array<() => void> = [];
let patchTimer: ReturnType<typeof setTimeout> | undefined;

function hex(v: string): string {
    return v.startsWith("#") ? v : `#${v}`;
}

function Settings() {
    useProxy(storage);
    const View = ReactNative?.View;
    const Text = ReactNative?.Text;

    const colorRow = (label: string, key: string) =>
        React.createElement(View, {
            key,
            style: { minHeight: 72, flexDirection: "row", alignItems: "center", marginBottom: 8 }
        },
            React.createElement(View, { style: { flex: 1, paddingRight: 12 } },
                React.createElement(Text, { style: { color: "white", fontSize: 16, fontWeight: "600" } }, label)
            ),
            React.createElement(View, {
                style: {
                    width: 24, height: 24, borderRadius: 4,
                    backgroundColor: hex(storage[key] ?? "f38ba8"),
                    marginRight: 8

            }),
            React.createElement(TextInput, {
                style: {
                    color: "white", fontSize: 14, borderWidth: 1,
                    borderColor: "#444", borderRadius: 6,
                    paddingHorizontal: 8, paddingVertical: 4, width: 100
                },
                value: storage[key] ?? "",
                placeholder: "hex color",
                placeholderTextColor: "#666",
                onChangeText: (v: string) => { storage[key] = v.replace(/[^0-9a-fA-F#]/g, "").slice(0, 7); }
            })
        );

    return React.createElement(View, { style: { paddingHorizontal: 16, paddingVertical: 12 } },
        React.createElement(Text, { style: { color: "#B5BAC1", fontSize: 22, fontWeight: "700", marginBottom: 8 } }, "PingColor Settings"),
        colorRow("Mention Background", "ment
        colorRow("Mention Bar", "mentionBarColor"),
        colorRow("Reply Background", "replyColor"),
        colorRow("Reply Bar", "replyBarColor
    );
}

function isMentionMessage(message: any, currentUserId: string | undefined): boolean {
    if (!message || !currentUserId) return f
tionEveryone) return true;
    const mentions = message.mentions;
    if (Array.isArray(mentions)) {
        return mentions.some((m: any) => (typeof m === "string" ? m : m?.id) === currentUserId);
    }
    return false;
}

function isReplyToMe(message: any, currentUserId: string | undefined): boolean {
    if (!message || !currentUserId) return false;
    const ref = message.referencedMessage ?? message.referenced_message;
    return ref?.author?.id === currentUserId
}

function installPatches() {
    const { findByProps } = require("@vendet
    const UserStore = findByProps("getCurrentUser", "getUser");
    const View = ReactNative?.View;
    if (!View || typeof React?.createElement !== "function") return;

    for (const MessageRow of findByTypeNameAll("MessageRow") as any[]) {
        if (typeof MessageRow?.type !== "function") continue;
        unpatches.push(after("type", MessageRow, (args, result) => {
            try {
                const props = args?.[0];
                const message = props?.messa props?.content?.message;
                if (!message) return;

                const currentUserId = UserSt
                const mentioned = isMentionMessage(message, currentUserId);
                const replied = isReplyToMe(message, currentUserId);
                if (!mentioned && !replied) return;

                const mc = hex(storage.mentionColor ?? "f38ba8");
                const mb = hex(storage.menti
                const rc = hex(storage.replyColor ?? "cdd6f4");
                const rb = hex(storage.replyBarColor ?? "cdd6f4");

                const bgColor = mentioned ? mc : rc;
                const barColor = mentioned ? mb : rb;

                const processColor = ReactNa
                const bgRgba = typeof processColor === "function"
                    ? processColor(bgColor + "18")
                    : bgColor + "18";
                const barProcessed = typeof
                    ? processColor(barColor)
                    : barColor;

                const messageContainer = findInReactTree(result, (node: any) =>
                    node?.props?.style && !node?.props?.pingColorWrapped
                    && (Array.isArray(node.props.children) || node.props.children?.props)
                );
                if (!messageContainer?.props) return;
                if (messageContainer.props.pingColorApplied) return;
                messageContainer.props.pingColorApplied = true;

                const originalStyle = messageContainer.props.style;
                messageContainer.props.style = [
                    originalStyle,
                    { backgroundColor: bgRgbLeftColor: barProcessed }
                ];
            } catch { return; }
        }));
    }
}

export default {
    onLoad() {
        storage.mentionColor ??= "f38ba8";
        storage.mentionBarColor ??= "f38ba8";
        storage.replyColor ??= "cdd6f4";
        storage.replyBarColor ??= "cdd6f4";
        patchTimer = setTimeout(() => {
            try { installPatches(); } catch {}
        }, 1500);
    },
    onUnload() {
        if (patchTimer) clearTimeout(patchTi
        patchTimer = undefined;
        for (const unpatch of unpatches.splice(0).reverse()) {
            try { unpatch(); } catch {}
        }
    },
    settings: Settings
};