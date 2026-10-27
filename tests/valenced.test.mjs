import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const runtime = readFileSync(new URL('../valenced/runtime.js', import.meta.url), 'utf8');
function environment() {
    const modules = [{ getBuiltInCommands: () => [{ id: '-1', type: 1 }] }];
    const cleanups = [];
    const saved = [];
    const React = { createElement: (type, props) => ({ type, props }) };
    function filter(predicate) { return predicate; }
    const v = {
        modules: { finders: {
            filters: {
                withProps: (...props) => filter(value => props.every(prop => prop in value)),
                withName: name => filter(value => value.name === name),
                createFilterGenerator: predicate => () => filter(value => predicate([], 0, value)),
            },
            lookupModule: predicate => [modules.find(predicate), 0],
            lookupModules: function* (predicate) { for (const value of modules.filter(predicate)) yield [value, 0]; },
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
        react: { React, ReactNative: {} },
        discord: { common: { constants: { Constants: {} }, flux: { Dispatcher: { dispatch() {} } } }, actions: { ToastActionCreators: { open() {} } } },
        externals: { ReactNativeClipboard: { Clipboard: {} } }, assets: { getAssetIdByName() {} },
    };
    const api = { unscoped: v, cleanup: (...items) => cleanups.push(...items), jsonStorage: {
        cache: {}, async get() {}, async set(value) { saved.push(value); },
    } };
    const context = vm.createContext({ console, setTimeout, clearTimeout, setInterval, clearInterval, valenced: v, plugin: value => value });
    const compat = vm.runInContext(`${runtime}; createCompatibility`, context)(api);
    return { api, v, modules, cleanups, saved, compat, context };
}

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
