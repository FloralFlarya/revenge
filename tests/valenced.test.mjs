import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const runtime = readFileSync(new URL('../valenced/runtime.js', import.meta.url), 'utf8');
function environment({ fakeTimers = false } = {}) {
    const modules = [{ getBuiltInCommands: () => [{ id: '-1', type: 1 }] }];
    const cleanups = [];
    const saved = [];
    const React = { createElement: (type, props, ...children) => {
        assert.notEqual(typeof type, 'number', 'React cannot render an asset ID as a component');
        return { type, props: { ...props, ...(children.length ? { children } : {}) } };
    } };
    const cache = new Map();
    function filter(predicate, key) { predicate.key = key; return predicate; }
    function* lookupModules(predicate, options = {}) {
        if (options.cached !== false && cache.has(predicate.key)) {
            yield* cache.get(predicate.key);
            return;
        }
        const results = [];
        for (const [id, namespace] of modules.entries()) {
            if (predicate(namespace)) results.push([namespace, id]);
            else if (namespace.default && predicate(namespace.default)) {
                results.push([options.returnNamespace ? namespace : namespace.default, id]);
            }
        }
        cache.set(predicate.key, results);
        yield* results;
    }
    const v = {
        modules: { finders: {
            filters: {
                withProps: (...props) => filter(value => props.every(prop => prop in value), `props:${props}`),
                withName: name => filter(value => value.name === name, `name:${name}`),
                createFilterGenerator: (predicate, key) => () => filter(value => predicate([], 0, value), key()),
            },
            lookupModule: (predicate, options) => [...lookupModules(predicate, options)][0] ?? [undefined, undefined],
            lookupModules,
        } },
        patcher: {
            instead(parent, key, hook) {
                const original = parent[key];
                parent[key] = function (...args) { return hook.call(this, args, original); };
                return () => { parent[key] = original; };
            },
            before(parent, key, hook) {
                return this.instead(parent, key, function (args, original) { return original.apply(this, hook(args)); });
            },
        },
        react: { React, ReactNative: { View: 'View', Text: 'Text', Image: 'Image', Switch: 'Switch' } },
        discord: { common: { constants: { Constants: {} }, flux: { Dispatcher: { dispatch() {} } } }, actions: { ToastActionCreators: { open() {} } } },
        externals: { ReactNativeClipboard: { Clipboard: {} } }, assets: { getAssetIdByName() {} },
    };
    const api = { unscoped: v, cleanup: (...items) => cleanups.push(...items), jsonStorage: {
        cache: {}, async get() {}, async set(value) { saved.push(value); },
    } };
    const timers = new Set();
    const schedule = callback => { timers.add(callback); return callback; };
    const context = vm.createContext({ console,
        setTimeout: fakeTimers ? schedule : setTimeout, clearTimeout: fakeTimers ? callback => timers.delete(callback) : clearTimeout,
        setInterval: fakeTimers ? schedule : setInterval, clearInterval: fakeTimers ? callback => timers.delete(callback) : clearInterval,
        valenced: v, plugin: value => value });
    const compat = vm.runInContext(`${runtime}; createCompatibility`, context)(api);
    return { api, v, modules, cleanups, saved, compat, context, timers, tick: () => { for (const callback of [...timers]) callback(); } };
}

function packageScript(id) {
    const index = JSON.parse(readFileSync(new URL('../valenced/index.json', import.meta.url)));
    const entry = index.plugins[id];
    const path = new URL(`../valenced/${entry.versions[entry.channels.latest].url.split('/').pop()}`, import.meta.url).pathname;
    return execFileSync('python3', ['-c', 'import sys,zipfile; print(zipfile.ZipFile(sys.argv[1]).read("index.js").decode())', path], { encoding: 'utf8' });
}

test('Mana notifications wrap numeric assets in an Image component', () => {
    const { compat, v } = environment();
    let displayed;
    v.discord.actions.ToastActionCreators.open = function (key, options) {
        assert.equal(typeof options.icon, 'function');
        displayed = options.icon({ style: { tintColor: 'white' } });
    };
    compat.ui.toasts.showToast('Blocked', 42);
    assert.equal(displayed.type, 'Image');
    assert.equal(displayed.props.source, 42);
});

test('legacy notifications retain the asset ID', () => {
    const { compat, v } = environment();
    let displayed;
    v.discord.actions.ToastActionCreators.open = function (options) { displayed = options; };
    compat.ui.toasts.showToast('Blocked', 42);
    assert.equal(displayed.icon, 42);
    assert.equal(displayed.content, 'Blocked');
});

test('Blocklist command displays a numeric asset safely in a Mana toast', async () => {
    const { api, v, context, modules, cleanups, saved } = environment({ fakeTimers: true });
    const notifications = [];
    v.assets.getAssetIdByName = () => 42;
    v.discord.actions.ToastActionCreators.open = function (key, options) {
        if (options.icon) assert.equal(options.icon({}).props.source, 42);
        notifications.push(options.text);
    };
    modules.push({ getCurrentUser: () => ({ id: '111111111111111111' }), getUser: id => ({ id, username: 'Alice' }) });
    const options = vm.runInContext(packageScript('flarya.blocklist'), context).default;
    await options.start(api);
    try {
        const command = modules[0].getBuiltInCommands(1).find(value => value.name === 'block');
        command.execute([{ name: 'user', value: '222222222222222222' }]);
        await new Promise(resolve => setImmediate(resolve));
        assert.ok(notifications.some(text => text.includes('добавлен в список')));
    } finally {
        await Promise.all(cleanups.map(fn => fn()));
    }
    assert.ok(saved.some(value => value.users?.includes('222222222222222222')));
});

test('plugin instances do not reuse another plugin finder cache', () => {
    const { compat, api, context, modules } = environment();
    const guilds = { getName: () => 'GuildStore' };
    const channels = { getName: () => 'ChannelStore' };
    modules.push(guilds, channels);
    assert.equal(compat.metro.findByStoreName('GuildStore'), guilds);
    const other = vm.runInContext('createCompatibility', context)(api);
    assert.equal(other.metro.findByStoreName('ChannelStore'), channels);
    assert.equal(compat.metro.findByProps('lateExport'), undefined);
    const late = { lateExport: true };
    modules.push(late);
    assert.equal(compat.metro.findByProps('lateExport'), late);
});

test('Staff Tags patches late screens once, tags ordinary humans and restores methods', async () => {
    const { api, context, modules, cleanups, timers, tick } = environment({ fakeTimers: true });
    const options = vm.runInContext(packageScript('flarya.stafftag'), context).default;
    await options.start(api);
    const tagModule = { default: function getTagProperties(input) { return input.author.bot ? { tagText: 'BOT' } : undefined; } };
    const original = tagModule.default;
    const user = { id: 'member', username: 'Alice' };
    const guild = { id: 'guild', ownerId: 'owner', roles: { guild: { permissions: '0' }, admin: { permissions: '8' } } };
    const row = { type: function MessageRow() { return { props: { children: ['Alice'] } }; } };
    const originalRow = row.type;
    modules.push(tagModule, row,
        { getName: () => 'GuildStore', getGuild: () => guild },
        { getName: () => 'ChannelStore', getChannel: () => ({ guild_id: 'guild' }) },
        { getMember: () => ({ roles: ['admin'] }), getMembers() {} },
    );
    try {
        tick();
        assert.equal(tagModule.default({ author: user, channel_id: 'channel' }).tagText, 'ADMIN');
        assert.equal(tagModule.default({ author: { ...user, id: 'owner' }, channel_id: 'channel' }).tagText, 'OWNER');
        assert.equal(tagModule.default({ author: { ...user, bot: true }, channel_id: 'channel' }).tagText, 'BOT');
        const patched = tagModule.default;
        const patchedRow = row.type;
        tick();
        assert.equal(tagModule.default, patched);
        assert.equal(row.type, patchedRow);
        const result = row.type({ message: { id: 'message', author: user, channel_id: 'channel' } });
        assert.equal(result.props.children.length, 2);
        assert.equal(result.props.children[1].props.staffTagsText, 'ADMIN');
    } finally {
        await Promise.all(cleanups.map(fn => fn()));
    }
    assert.equal(tagModule.default, original);
    assert.equal(row.type, originalRow);
    assert.equal(timers.size, 0);
});

test('adapts argument order, this binding, undefined return and unpatching', () => {
    const { compat } = environment();
    const target = { factor: 3, multiply(value) { return value * this.factor; } };
    const original = target.multiply;
    const undo = compat.patcher.after('multiply', target, (args, result) => result + args[0]);
    assert.equal(target.multiply(2), 8);
    undo();
    assert.equal(target.multiply, original);
    const remove = compat.patcher.before('multiply', target, args => { args[0] += 1; });
    assert.equal(target.multiply(2), 9);
    remove();
    compat.patcher.after('multiply', target, () => undefined);
    assert.equal(target.multiply(2), 6);
});

test('persists nested changes and deletions in order', async () => {
    const { compat, saved } = environment();
    const storage = compat.plugin.storage;
    storage.volumes = {};
    storage.volumes.user = 42;
    delete storage.volumes.user;
    await compat.flush();
    assert.equal(saved.length, 3);
    assert.equal(saved[1].volumes.user, 42);
    assert.equal('user' in saved[2].volumes, false);
});

test('local commands register, execute and unregister', async () => {
    const { compat, modules, cleanups } = environment();
    let executed = false;
    const unregister = compat.commands.registerCommand({ name: 'block', description: 'test', execute() { executed = true; } });
    const command = modules[0].getBuiltInCommands(1).find(value => value.name === 'block');
    assert.equal(command.inputType, 0);
    command.execute([]);
    await Promise.resolve();
    assert.equal(executed, true);
    unregister();
    assert.equal(modules[0].getBuiltInCommands(1).length, 1);
    cleanups.forEach(fn => fn());
});

test('packages match catalogue hashes, manifests and Valenced lifecycle', async () => {
    const root = new URL('../', import.meta.url);
    const index = JSON.parse(readFileSync(new URL('valenced/index.json', root)));
    assert.equal(index.format, 1);
    for (const [id, entry] of Object.entries(index.plugins)) {
        const version = entry.versions[entry.channels.latest];
        const path = new URL(`valenced/${version.url.split('/').pop()}`, root).pathname;
        const { createHash } = await import('node:crypto');
        const bytes = readFileSync(path);
        assert.equal(bytes.length, version.size);
        assert.equal(createHash('sha256').update(bytes).digest('hex'), version.sha256);
        const files = JSON.parse(execFileSync('python3', ['-c', 'import json,sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); print(json.dumps({n:z.read(n).decode() for n in z.namelist()}))', path]));
        const manifest = JSON.parse(files['manifest.json']);
        assert.equal(manifest.id, id);
        assert.deepEqual(manifest.dependencies, version.dependencies);
        assert.equal(manifest.version, entry.channels.latest);
        assert.equal(manifest.dist.script, 'index.js');
        const { context, api, cleanups } = environment();
        const options = vm.runInContext(files['index.js'], context).default;
        assert.equal(typeof options.start, 'function');
        assert.equal(options.SettingsComponent(), null);
        await options.start(api);
        if (id !== 'flarya.blocklist') assert.ok(options.SettingsComponent());
        await Promise.all(cleanups.map(fn => fn()));
        assert.equal(options.SettingsComponent(), null);
    }
});
