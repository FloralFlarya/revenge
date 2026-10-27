// Scoped adapter for the published Revenge bundles; no global vendetta dependency
function createCompatibility(api) {
    const v = api.unscoped;
    const { lookupModule, lookupModules, filters } = v.modules.finders;
    // These lookups always scan fresh exports, including modules loaded after startup
    // Keep a bounded set of cache keys because Staff Tags retries as screens load
    function matching(predicate, key = 'scan') {
        return filters.createFilterGenerator(
            (_, id, value) => Boolean(value && predicate(value)),
            () => `flarya.compat.${key}`,
        )();
    }
    const findByProps = (...props) => lookupModule(filters.withProps(...props), { cached: false })[0];
    const findByName = (name, defaultExport = true) =>
        lookupModule(filters.withName(name), { returnNamespace: !defaultExport, cached: false })[0];
    const findAll = predicate => [...lookupModules(matching(predicate), { cached: false })].map(([value]) => value);
    const findByStoreName = name => lookupModule(matching(value => typeof value.getName === 'function' && value.getName() === name, `store.${name}`), { cached: false })[0];
    const findByTypeNameAll = name => [...lookupModules(matching(value => value.type?.name === name, `type.${name}`), { cached: false })].map(([value]) => value);

    // Vendetta after hooks receive arguments and keep the result on undefined
    const after = (key, parent, hook) => v.patcher.instead(parent, key, function (args, original) {
        const result = original.apply(this, args);
        const replacement = hook.call(this, args, result);
        return replacement === undefined ? result : replacement;
    });
    const before = (key, parent, hook) => v.patcher.before(parent, key, args => hook(args) ?? args);

    const state = JSON.parse(JSON.stringify(api.jsonStorage.cache ?? {}));
    const listeners = new Set();
    const proxies = new WeakMap();
    let writes = Promise.resolve();
    function persist() {
        const snapshot = JSON.parse(JSON.stringify(state));
        writes = writes.then(() => api.jsonStorage.set(snapshot, true));
        // Report storage failures while keeping later updates writable
        writes = writes.catch(error => console.error('Flarya plugin storage', error));
        for (const listener of listeners) listener();
    }
    function observable(value) {
        if (!value || typeof value !== 'object') return value;
        if (proxies.has(value)) return proxies.get(value);
        const proxy = new Proxy(value, {
            get(target, key) { return observable(target[key]); },
            set(target, key, next) { target[key] = next; persist(); return true; },
            deleteProperty(target, key) { delete target[key]; persist(); return true; },
        });
        proxies.set(value, proxy);
        return proxy;
    }
    function useProxy() {
        const [, render] = v.react.React.useReducer(n => n + 1, 0);
        v.react.React.useEffect(() => {
            listeners.add(render);
            return () => listeners.delete(render);
        }, []);
    }
    function findInReactTree(root, predicate) {
        const seen = new Set();
        function visit(node) {
            if (!node || typeof node !== 'object' || seen.has(node)) return;
            seen.add(node);
            if (predicate(node)) return node;
            const children = Array.isArray(node) ? node : [node.props?.children, node.props?.label, node.props?.title];
            for (const child of children) {
                const result = visit(child);
                if (result) return result;
            }
        }
        return visit(root);
    }
    function showToast(text, icon) {
        const toasts = v.discord.actions.ToastActionCreators;
        const key = `flarya-${Date.now()}`;
        if (toasts.open.length === 1) toasts.open({ key, content: text, icon });
        else {
            // Mana toasts render icon as a component, while Revenge passes an asset ID
            const Icon = typeof icon === 'number'
                ? props => v.react.React.createElement(v.react.ReactNative.Image, {
                    ...props, source: icon, style: [{ width: 24, height: 24 }, props?.style],
                })
                : icon;
            toasts.open(key, { text, icon: Icon });
        }
    }
    const commands = [];
    let removeCommands;
    let unsubscribeCommands;
    let commandModule;
    let discoveringCommands = false;
    let commandsStopped = false;
    function builtinCommands(module) {
        try { return module.getBuiltInCommands(1, true, false); }
        catch { return module.getBuiltInCommands([1, 2, 3], true, false); }
    }
    function bindCommands(module) {
        if (commandsStopped || removeCommands || !commands.length) return;
        const builtins = builtinCommands(module);
        let id = Math.min(-1, ...builtins.map(item => Number(item.id)).filter(Number.isFinite));
        for (const command of commands) command.id = String(--id);
        commandModule = module;
        removeCommands = after('getBuiltInCommands', module, ([types], result) => [
            ...result,
            ...commands.filter(item => (Array.isArray(types) ? types : [types]).includes(item.type)),
        ]);
    }
    function discoverCommands() {
        if (discoveringCommands) {
            if (!removeCommands) {
                const module = findByProps('getBuiltInCommands');
                if (module) bindCommands(module);
            }
            return;
        }
        discoveringCommands = true;
        api.cleanup(() => {
            commandsStopped = true;
            unsubscribeCommands?.();
            removeCommands?.();
            commands.length = 0;
        });
        const module = findByProps('getBuiltInCommands');
        if (module) bindCommands(module);
        else unsubscribeCommands = v.modules.finders.getModules(
            filters.withProps('getBuiltInCommands'), bindCommands, { cached: false },
        );
    }
    function registerCommand(command) {
        const existing = commandModule ? builtinCommands(commandModule) : commands;
        const ids = existing.map(item => Number(item.id)).filter(Number.isFinite);
        Object.assign(command, {
            id: String(Math.min(-1, ...ids) - 1), applicationId: '-1', type: 1, inputType: 0,
            displayName: command.name, untranslatedName: command.name,
            displayDescription: command.description, untranslatedDescription: command.description,
        });
        for (const option of command.options ?? []) {
            option.displayName = option.name;
            option.displayDescription = option.description;
        }
        const execute = command.execute;
        command.execute = (...args) => {
            Promise.resolve().then(() => execute(...args)).catch(error => {
                console.error('Flarya command failed', error);
                showToast(String(error));
            });
        };
        commands.push(command);
        discoverCommands();
        return () => { const index = commands.indexOf(command); if (index >= 0) commands.splice(index, 1); };
    }
    return {
        logger: console,
        metro: {
            findByProps, findByName, findByStoreName, findByTypeNameAll, findAll,
            common: {
                React: v.react.React, ReactNative: v.react.ReactNative,
                constants: v.discord.common.constants.Constants,
                FluxDispatcher: v.discord.common.flux.Dispatcher,
                clipboard: v.externals.ReactNativeClipboard.Clipboard,
            },
        },
        patcher: { before, after },
        plugin: { storage: observable(state) },
        storage: { useProxy },
        utils: { findInReactTree },
        commands: { registerCommand },
        ui: { assets: { getAssetIDByName: v.assets.getAssetIdByName }, toasts: { showToast } },
        flush: () => writes,
    };
}
