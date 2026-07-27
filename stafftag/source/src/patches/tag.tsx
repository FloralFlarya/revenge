import { findByProps } from "@vendetta/metro";
import { after } from "@vendetta/patcher";
import { findInReactTree } from "@vendetta/utils";

const Tag = findByProps("getBotLabel")

export default () => after("default", Tag, ([{ text, textColor, backgroundColor }], ret) => {
    if (!ret) return ret;
    const label = findInReactTree(ret, (c) => typeof c?.props?.children === "string")

    if (text && label?.props) label.props.children = text;
    if (textColor && label?.props) {
        label.props.style = [...(Array.isArray(label.props.style) ? label.props.style : [label.props.style]), { color: textColor }];
    }
    if (backgroundColor && ret?.props) {
        ret.props.style = [...(Array.isArray(ret.props.style) ? ret.props.style : [ret.props.style]), { backgroundColor }];
    }
})

