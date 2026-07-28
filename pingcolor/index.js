(function (P, u, t, O, d, z, H) {
    "use strict";

    let w = [];
    let F;

    function x(v) {
        return v.startsWith("#") ? v : `#${v}`;
    }

    function $() {
        z.useProxy(d.storage);

        const View = t.ReactNative?.View;
        const Text = t.ReactNative?.Text;
        const TextInput = t.ReactNative?.TextInput;

        if (
            !View ||
            !Text ||
            !TextInput ||
            typeof t.React?.createElement !== "function"
        ) {
            return null;
        }

        const createColorSetting = function (label, key, defaultColor) {
            return t.React.createElement(
                View,
                {
                    key,
                    style: {
                        minHeight: 72,
                        flexDirection: "row",
                        alignItems: "center",
                        marginBottom: 8,
                    },
                },

                t.React.createElement(
                    View,
                    {
                        style: {
                            flex: 1,
                            paddingRight: 12,
                        },
                    },

                    t.React.createElement(
                        Text,
                        {
                            style: {
                                color: "white",
                                fontSize: 16,
                                fontWeight: "600",
                            },
                        },
                        label,
                    ),
                ),

                t.React.createElement(View, {
                    style: {
                        width: 24,
                        height: 24,
                        borderRadius: 4,
                        backgroundColor: x(
                            d.storage[key] ?? defaultColor,
                        ),
                        marginRight: 8,
                    },
                }),

                t.React.createElement(TextInput, {
                    style: {
                        color: "white",
                        fontSize: 14,
                        borderWidth: 1,
                        borderColor: "#444",
                        borderRadius: 6,
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        width: 100,
                    },

                    value: d.storage[key] ?? defaultColor,
                    placeholder: "hex color",
                    placeholderTextColor: "#666",

                    onChangeText: function (value) {
                        d.storage[key] = value
                            .replace(/[^0-9a-fA-F#]/g, "")
                            .slice(0, 7);
                    },
                }),
            );
        };

        return t.React.createElement(
            View,
            {
                style: {
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                },
            },

            t.React.createElement(
                Text,
                {
                    style: {
                        color: "#B5BAC1",
                        fontSize: 22,
                        fontWeight: "700",
                        marginBottom: 8,
                    },
                },
                "PingColor Settings",
            ),

            createColorSetting(
                "Mention Background",
                "mentionColor",
                "f38ba8",
            ),

            createColorSetting(
                "Mention Bar",
                "mentionBarColor",
                "f38ba8",
            ),

            createColorSetting(
                "Reply Background",
                "replyColor",
                "cdd6f4",
            ),

            createColorSetting(
                "Reply Bar",
                "replyBarColor",
                "cdd6f4",
            ),
        );
    }

    function j(message, userId) {
        if (!message || !userId) {
            return false;
        }

        if (message.mentionEveryone) {
            return true;
        }

        const mentions = message.mentions;

        return Array.isArray(mentions)
            ? mentions.some(function (mention) {
                  const mentionId =
                      typeof mention === "string"
                          ? mention
                          : mention?.id;

                  return mentionId === userId;
              })
            : false;
    }

    function k(message, userId) {
        if (!message || !userId) {
            return false;
        }

        const referencedMessage =
            message.referencedMessage ??
            message.referenced_message;

        return referencedMessage?.author?.id === userId;
    }

    function D() {
        const userStore = u.findByProps(
            "getCurrentUser",
            "getUser",
        );

        const View = t.ReactNative?.View;

        if (
            !View ||
            typeof t.React?.createElement !== "function"
        ) {
            return;
        }

        for (const messageRow of u.findByTypeNameAll("MessageRow")) {
            if (typeof messageRow?.type !== "function") {
                continue;
            }

            w.push(
                O.after(
                    "type",
                    messageRow,

                    function (args, result) {
                        try {
                            const props = args?.[0];

                            const message =
                                props?.message ??
                                props?.item?.message ??
                                props?.content?.message;

                            if (!message) {
                                return;
                            }

                            const currentUserId =
                                userStore
                                    ?.getCurrentUser?.()
                                    ?.id;

                            const isMention = j(
                                message,
                                currentUserId,
                            );

                            const isReply = k(
                                message,
                                currentUserId,
                            );

                            if (!isMention && !isReply) {
                                return;
                            }

                            const mentionColor = x(
                                d.storage.mentionColor ??
                                    "f38ba8",
                            );

                            const mentionBarColor = x(
                                d.storage.mentionBarColor ??
                                    "f38ba8",
                            );

                            const replyColor = x(
                                d.storage.replyColor ??
                                    "cdd6f4",
                            );

                            const replyBarColor = x(
                                d.storage.replyBarColor ??
                                    "cdd6f4",
                            );

                            const backgroundColor =
                                isMention
                                    ? mentionColor
                                    : replyColor;

                            const borderColor =
                                isMention
                                    ? mentionBarColor
                                    : replyBarColor;

                            const processColor =
                                t.ReactNative?.processColor;

                            const processedBackground =
                                typeof processColor ===
                                "function"
                                    ? processColor(
                                          backgroundColor +
                                              "18",
                                      )
                                    : backgroundColor + "18";

                            const processedBorder =
                                typeof processColor ===
                                "function"
                                    ? processColor(borderColor)
                                    : borderColor;

                            const messageContainer =
                                H.findInReactTree(
                                    result,

                                    function (node) {
                                        return (
                                            node?.props?.style &&
                                            !node?.props
                                                ?.pingColorApplied &&
                                            (
                                                Array.isArray(
                                                    node.props
                                                        .children,
                                                ) ||
                                                node.props
                                                    .children
                                                    ?.props
                                            )
                                        );
                                    },
                                );

                            if (!messageContainer?.props) {
                                return;
                            }

                            messageContainer.props.pingColorApplied =
                                true;

                            const oldStyle =
                                messageContainer.props.style;

                            messageContainer.props.style = [
                                oldStyle,
                                {
                                    backgroundColor:
                                        processedBackground,
                                    borderLeftWidth: 3,
                                    borderLeftColor:
                                        processedBorder,
                                },
                            ];
                        } catch {
                            return;
                        }
                    },
                ),
            );
        }
    }

    const plugin = {
        onLoad: function () {
            d.storage.mentionColor ??= "f38ba8";
            d.storage.mentionBarColor ??= "f38ba8";
            d.storage.replyColor ??= "cdd6f4";
            d.storage.replyBarColor ??= "cdd6f4";

            F = setTimeout(function () {
                try {
                    D();
                } catch {}
            }, 1500);
        },

        onUnload: function () {
            if (F) {
                clearTimeout(F);
            }

            F = undefined;

            for (const unpatch of w.splice(0).reverse()) {
                try {
                    unpatch();
                } catch {}
            }
        },

        settings: $,
    };

    P.default = plugin;

    Object.defineProperty(P, "__esModule", {
        value: true,
    });

    return P;
})(
    {},
    vendetta.metro,
    vendetta.metro.common,
    vendetta.patcher,
    vendetta.plugin,
    vendetta.storage,
    vendetta.utils,
);