import { findByName, findByProps, findByStoreName, findByTypeNameAll } from "@vendetta/metro";
import { constants, React, ReactNative } from "@vendetta/metro/common";
import { after } from "@vendetta/patcher";
import { storage } from "@vendetta/plugin";
import { useProxy } from "@vendetta/storage";
import { findInReactTree } from "@vendetta/utils";

let cancelPatches: Array<() => void> = [];
let startTimer: ReturnType<typeof setTimeout> | undefined;

const BUILTIN_TAGS = new Set(["BOT", "APP", "SYSTEM", "SERVER", "AI", "AUTOMOD"]);
const TAGS = [
    { text: "OWNER", color: "#f0b232", owner: true },
    { text: "ADMIN", color: "#ed4245", permissions: ["ADMINISTRATOR"] },
    { text: "STAFF", color: "#57f287", permissions: ["MANAGE_GUILD", "MANAGE_CHANNELS", "MANAGE_ROLES", "MANAGE_WEBHOOKS"] },
    { text: "MOD", color: "#5865f2", permissions: ["MANAGE_MESSAGES", "KICK_MEMBERS", "BAN_MEMBERS"] },
    { text: "VC MOD", color: "#00a8fc", permissions: ["MOVE_MEMBERS", "MUTE_MEMBERS", "DEAFEN_MEMBERS"] },
    { text: "CHAT MOD", color: "#9b59b6", permissions: ["MODERATE_MEMBERS"] }
] as const;

function Settings() {
    useProxy(storage);
    const View = ReactNative?.View;
    const Text = ReactNative?.Text;
    const Switch = ReactNative?.Switch;
    if (!View || !Text || !Switch || typeof React?.createElement !== "function") return null;

    const row = (title: string, description: string, key: "useRoleColor" | "showInChat" | "showInMemberList") =>
        React.createElement(View, {
            key,
            style: { minHeight: 82, flexDirection: "row", alignItems: "center" }
        },
        React.createElement(View, { style: { flex: 1, paddingRight: 12 } },
            React.createElement(Text, { style: { color: "white", fontSize: 17, fontWeight: "600" } }, title),
            React.createElement(Text, { style: { color: "#B5BAC1", fontSize: 14, marginTop: 4 } }, description)
        ),
        React.createElement(Switch, {
            value: Boolean(storage[key]),
            onValueChange: (value: boolean) => { storage[key] = value; }
        }));

    return React.createElement(View, { style: { paddingHorizontal: 16, paddingVertical: 12 } },
        React.createElement(Text, { style: { color: "#B5BAC1", fontSize: 22, fontWeight: "700", marginBottom: 2 } }, "Settings"),
        row("Use Role Color", "Use the member's role color for the tag", "useRoleColor"),
        row("Show In Chat", "Show staff tags next to names in chat", "showInChat"),
        row("Show In Member List", "Show staff tags in the server member list", "showInMemberList")
    );
}

function hasPermission(value: unknown, permission: unknown): boolean {
    try { return (BigInt(value as any) & BigInt(permission as any)) !== 0n; }
    catch { return false; }
}

function resolveTag(guild: any, channel: any, author: any, permissionModule: any, permissions: any) {
    if (!guild || !author || author.bot) return;
    let computed: unknown;
    try {
        computed = permissionModule?.computePermissions?.({
            user: author,
            context: guild,
            overwrites: channel?.permissionOverwrites
        });
    } catch {}
    return TAGS.find(candidate =>
        (candidate.owner && (guild.ownerId ?? guild.owner_id) === author.id) ||
        ("permissions" in candidate && candidate.permissions.some(name => hasPermission(computed, permissions[name])))
    );
}

function colorToHex(value: any): string | undefined {
    if (typeof value === "string" && value) return value.startsWith("#") ? value : undefined;
    if (typeof value === "number" && value > 0) return `#${value.toString(16).padStart(6, "0").slice(-6)}`;
}

function contrastText(color: any, fallback = "#5865f2"): "#111111" | "#FFFFFF" {
    let red: number | undefined;
    let green: number | undefined;
    let blue: number | undefined;
    if (typeof color === "number") {
        const rgb = color >>> 0;
        red = (rgb >> 16) & 255;
        green = (rgb >> 8) & 255;
        blue = rgb & 255;
    } else {
        const source = typeof color === "string" ? color : fallback;
        const match = source.match(/^#([\da-f]{3}|[\da-f]{6})$/i);
        if (match) {
            const hex = match[1].length === 3
                ? [...match[1]].map(value => value + value).join("")
                : match[1];
            red = parseInt(hex.slice(0, 2), 16);
            green = parseInt(hex.slice(2, 4), 16);
            blue = parseInt(hex.slice(4, 6), 16);
        }
    }
    if (red == null || green == null || blue == null) return "#FFFFFF";
    return (red * 299 + green * 587 + blue * 114) / 255000 > 0.62 ? "#111111" : "#FFFFFF";
}

function resolveRoleColor(guild: any, member: any, rowProps?: any): string | undefined {
    const direct = [
        member?.colorString,
        member?.color,
        rowProps?.colorString,
        rowProps?.nameColor,
        rowProps?.color
    ].map(colorToHex).find(Boolean);
    if (direct) return direct;

    const roleIds = member?.roles ?? member?.roleIds ?? rowProps?.roles ?? rowProps?.roleIds;
    if (!Array.isArray(roleIds)) return;
    const roleMap = guild?.roles ?? guild?.roleMap;
    const roles = roleIds
        .map((id: string) => roleMap?.[id] ?? roleMap?.get?.(id))
        .filter((role: any) => role && (role.color || role.colorString))
        .sort((a: any, b: any) => (b.position ?? 0) - (a.position ?? 0));
    return colorToHex(roles[0]?.colorString) ?? colorToHex(roles[0]?.color);
}

function installChatPatch() {
    const tagModule = findByName("getTagProperties", false) as any;
    const GuildStore = findByStoreName("GuildStore") as any;
    const ChannelStore = findByStoreName("ChannelStore") as any;
    const GuildMemberStore = (findByProps("getMember", "getMembers") ?? findByStoreName("GuildMemberStore")) as any;
    const permissionModule = findByProps("computePermissions", "canEveryoneRole") as any;
    const permissions = (constants as any)?.Permissions ?? {};
    if (typeof tagModule?.default !== "function") return;

    cancelPatches.push(after("default", tagModule, (args, result) => {
        try {
            const input = args?.[0];
            const message = input?.message ?? input;
            const author = message?.author;
            if (storage.showInChat === false) return;
            if (!result || !author || author.bot || BUILTIN_TAGS.has(String(result.tagText).toUpperCase())) return;
            const channel = ChannelStore?.getChannel?.(message.channel_id ?? message.channelId);
            const guild = GuildStore?.getGuild?.(channel?.guild_id ?? channel?.guildId);
            const tag = resolveTag(guild, channel, author, permissionModule, permissions);
            if (!tag) return;

            const member = GuildMemberStore?.getMember?.(guild.id, author.id);
            const background = storage.useRoleColor ? resolveRoleColor(guild, member) ?? tag.color : tag.color;
            const processColor = ReactNative?.processColor;
            return {
                ...result,
                tagText: tag.text,
                tagTextColor: typeof processColor === "function" ? processColor(contrastText(background)) : undefined,
                tagBackgroundColor: typeof processColor === "function" ? processColor(background) : undefined,
                tagVerified: false,
                tagType: undefined
            };
        } catch { return; }
    }));
}

function installTabPatches() {
    const GuildStore = findByStoreName("GuildStore") as any;
    const ChannelStore = findByStoreName("ChannelStore") as any;
    const GuildMemberStore = (findByProps("getMember", "getMembers") ?? findByStoreName("GuildMemberStore")) as any;
    const GuildRoleStore = (findByProps("getRole", "getRoles") ?? findByStoreName("GuildRoleStore")) as any;
    const permissionModule = findByProps("computePermissions", "canEveryoneRole") as any;
    const permissions = (constants as any)?.Permissions ?? {};
    const View = ReactNative?.View;
    const Text = ReactNative?.Text;
    if (!View || !Text || typeof React?.createElement !== "function") return;

    for (const UserRow of findByTypeNameAll("UserRow") as any[]) {
        if (typeof UserRow?.type !== "function") continue;
        cancelPatches.push(after("type", UserRow, (args, result) => {
            try {
                const props = args?.[0];
                const user = props?.user;
                const guildId = props?.guildId ?? props?.guild_id;
                if (storage.showInMemberList === false) return;
                if (!result || !user || !guildId) return;
                const guild = GuildStore?.getGuild?.(guildId);
                const tag = resolveTag(guild, undefined, user, permissionModule, permissions);
                if (!tag) return;

                const labelRoot = result?.props?.label ?? result;
                const nameContainer = findInReactTree(labelRoot, node =>
                    Array.isArray(node?.props?.children) && node.props.children.some((child: any) =>
                        typeof child === "string" || typeof child?.props?.children === "string"
                    )
                );
                if (!nameContainer?.props) return;
                if (nameContainer.props.children.some((child: any) => child?.props?.staffTagsText)) return;

                const member = GuildMemberStore?.getMember?.(guild.id, user.id) ?? props?.member ?? props?.guildMember;
                const background = storage.useRoleColor ? resolveRoleColor(guild, member, props) ?? tag.color : tag.color;
                const processColor = ReactNative?.processColor;
                const flatten = ReactNative?.StyleSheet?.flatten;
                const coloredName = storage.useRoleColor && findInReactTree(labelRoot, node => {
                    try {
                        const style = typeof flatten === "function" ? flatten(node?.props?.style) : node?.props?.style;
                        const text = node?.props?.children;
                        const knownNames = [member?.nick, props?.name, user?.globalName, user?.username].filter(Boolean);
                        return typeof text === "string" && knownNames.includes(text) && style?.color != null;
                    } catch { return false; }
                });
                let renderedNameColor: any;
                try {
                    const style = typeof flatten === "function" ? flatten(coloredName?.props?.style) : coloredName?.props?.style;
                    renderedNameColor = style?.color;
                } catch {}
                const rawRowColor = props?.nameColor ?? props?.usernameColor ?? props?.colorString ?? props?.color;
                let roleStoreColor: any;
                if (storage.useRoleColor && !renderedNameColor && rawRowColor == null && Array.isArray(member?.roles)) {
                    const coloredRole = member.roles
                        .map((id: string) => GuildRoleStore?.getRole?.(guild.id, id))
                        .filter((role: any) => role && (role.colorString || role.color))
                        .sort((a: any, b: any) => (b.position ?? 0) - (a.position ?? 0))[0];
                    roleStoreColor = coloredRole?.colorString ?? (coloredRole?.color ? `#${coloredRole.color.toString(16).padStart(6, "0")}` : undefined);
                }
                const exactRoleColor = renderedNameColor ?? rawRowColor ?? member?.colorString ?? roleStoreColor;
                const processedBackground = storage.useRoleColor && exactRoleColor != null
                    ? exactRoleColor
                    : (typeof processColor === "function" ? processColor(background) : background);
                const processedText = contrastText(exactRoleColor ?? background, background);
                nameContainer.props.children.push(React.createElement(View, {
                    key: `staff-tags-${user.id}`,
                    staffTagsText: tag.text,
                    style: {
                        marginLeft: 4,
                        paddingHorizontal: 4,
                        height: 18,
                        minHeight: 18,
                        borderRadius: 4,
                        backgroundColor: processedBackground,
                        alignItems: "center",
                        justifyContent: "center",
                        alignSelf: "center",
                        flexShrink: 0,
                        overflow: "visible"
                    }
                }, React.createElement(Text, {
                    style: {
                        color: processedText,
                        fontSize: 11,
                        fontWeight: "700",
                        lineHeight: 15,
                        includeFontPadding: false,
                        textAlignVertical: "center"
                    }
                }, tag.text)));
            } catch { return; }
        }));
    }

    for (const MessageRow of findByTypeNameAll("MessageRow") as any[]) {
        if (typeof MessageRow?.type !== "function") continue;
        cancelPatches.push(after("type", MessageRow, (args, result) => {
            try {
                if (storage.showInChat === false || !result) return;
                const props = args?.[0];
                const message = props?.message ?? props?.item?.message ?? props?.content?.message;
                const user = message?.author;
                if (!message || !user) return;
                const channel = ChannelStore?.getChannel?.(message.channel_id ?? message.channelId ?? props?.channelId);
                const guild = GuildStore?.getGuild?.(channel?.guild_id ?? channel?.guildId ?? props?.guildId);
                const tag = resolveTag(guild, channel, user, permissionModule, permissions);
                if (!tag) return;

                const knownNames = [message?.member?.nick, user?.globalName, user?.username].filter(Boolean);
                const nameContainer = findInReactTree(result, node => {
                    const children = node?.props?.children;
                    if (!Array.isArray(children)) return false;
                    return children.some((child: any) => {
                        const text = typeof child === "string" ? child : child?.props?.children;
                        return typeof text === "string" && knownNames.includes(text);
                    });
                });
                if (!nameContainer?.props) return;
                if (nameContainer.props.children.some((child: any) => child?.props?.staffTagsText)) return;

                const member = message?.member ?? GuildMemberStore?.getMember?.(guild?.id, user.id);
                const background = storage.useRoleColor ? resolveRoleColor(guild, member) ?? tag.color : tag.color;
                const processColor = ReactNative?.processColor;
                const processedBackground = typeof processColor === "function" ? processColor(background) : background;
                nameContainer.props.children.push(React.createElement(View, {
                    key: `staff-tags-chat-${message.id}`,
                    staffTagsText: tag.text,
                    style: {
                        marginLeft: 4,
                        paddingHorizontal: 4,
                        height: 18,
                        minHeight: 18,
                        borderRadius: 4,
                        backgroundColor: processedBackground,
                        alignItems: "center",
                        justifyContent: "center",
                        alignSelf: "center",
                        flexShrink: 0,
                        overflow: "visible"
                    }
                }, React.createElement(Text, {
                    style: {
                        color: contrastText(background),
                        fontSize: 11,
                        fontWeight: "700",
                        lineHeight: 15,
                        includeFontPadding: false,
                        textAlignVertical: "center"
                    }
                }, tag.text)));
            } catch { return; }
        }));
    }
}

export default {
    onLoad: () => {
        storage.useRoleColor ??= true;
        storage.showInChat ??= true;
        storage.showInMemberList ??= true;
        startTimer = setTimeout(() => {
            try { installChatPatch(); } catch {}
            try { installTabPatches(); } catch {}
        }, 1500);
    },
    onUnload: () => {
        if (startTimer) clearTimeout(startTimer);
        startTimer = undefined;
        for (const cancel of cancelPatches.splice(0).reverse()) {
            try { cancel(); } catch {}
        }
    },
    settings: Settings
};
