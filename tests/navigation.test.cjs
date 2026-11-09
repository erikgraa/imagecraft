const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const source = html.slice(html.indexOf('const titles='), html.indexOf('const templates='));
const views = ['learn', 'compose', 'build', 'pipeline', 'templates'];

function element(id, view, tagName = 'BUTTON') {
  const classes = new Set();
  return {
    id, tagName, dataset: { view }, attributes: {}, listeners: {},
    classList: {
      toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); },
      contains(name) { return classes.has(name); },
    },
    setAttribute(name, value) { this.attributes[name] = value; },
    removeAttribute(name) { delete this.attributes[name]; },
    addEventListener(name, callback) { this.listeners[name] = callback; },
    focus() { this.focused = true; },
  };
}

function app(url = 'https://imagecraft.test/') {
  const sections = views.map(view => element('view-' + view, view));
  const navigation = views.map(view => element('', view));
  const home = element('', 'learn', 'A');
  const compose = element('', 'compose', 'A');
  const controls = [...navigation, home, compose];
  const headings = Object.fromEntries(['chapter', 'headline', 'subtitle', 'warning'].map(id => [id, element(id)]));
  const projectbar = element('projectbar');
  const events = {};
  const entries = [url];
  let index = 0;
  const location = {
    get href() { return entries[index]; },
    get search() { return new URL(entries[index]).search; },
  };
  const context = vm.createContext({
    URL, URLSearchParams, location, theme: 'workbench', view: 'learn',
    recipe: {
      version: '9', image: 'quay.io/example/saved:v1', digest: 'sha256:' + 'a'.repeat(64),
      rows: [{ id: 'saved', type: 'packages', value: 'curl' }],
      stages: [{ name: 'builder', base: 'quay.io/example/builder:v1' }],
      files: { 'files/config.txt': 'c2F2ZWQ=' },
    },
    pipelineProvider: 'gitlab', tab: 'build',
    finishSort(commit) { assert.equal(commit, false); },
    errors: () => [],
    $: id => headings[id],
    document: { querySelector(selector) {
      assert.equal(selector, '.projectbar');
      return projectbar;
    }, querySelectorAll(selector) {
      if (selector === '.view') return sections;
      if (selector === '[data-view]') return controls;
      if (selector === '.sidebar [data-view],.path [data-view]') return navigation;
      throw new Error('Unexpected selector: ' + selector);
    } },
    window: { addEventListener(name, callback) { events[name] = callback; } },
    history: { pushState(state, title, next) { entries.splice(index + 1); entries.push(next.href); index++; } },
  });
  vm.runInContext(source + '\nshowView(viewFromUrl());', context);
  return {
    context, sections, navigation, home, compose, headings, entries, projectbar,
    click(control, modifiers = {}) {
      let prevented = false;
      control.listeners.click({ button: 0, preventDefault() { prevented = true; }, ...modifiers });
      return prevented;
    },
    back() { index--; events.popstate(); },
    forward() { index++; events.popstate(); },
  };
}

for (const [query, expected] of [['', 'learn'], ['?view=learn', 'learn'], ['?view=unknown', 'learn'], ['?view=toString', 'learn'], ...views.map(view => ['?view=' + view, view])]) {
  test(`initial load ${query || '/'} displays ${expected} without adding history`, () => {
    const state = app('https://imagecraft.test/' + query);
    assert.equal(state.context.view, expected);
    assert.equal(state.entries.length, 1);
    assert.deepEqual(state.sections.filter(section => !section.classList.contains('hidden')).map(section => section.dataset.view), [expected]);
    assert.equal(state.navigation.find(control => control.dataset.view === expected).attributes['aria-current'], 'page');
    assert.equal(state.headings.headline.focused, undefined);
    assert.equal(state.projectbar.hidden, expected !== 'compose');
    assert.equal(state.navigation.find(control => control.dataset.view === expected).attributes['aria-pressed'], 'true');
  });
}

test('navigation, home, Back and Forward preserve recipe and preferences', () => {
  const state = app('https://imagecraft.test/?campaign=test#guide');
  const before = JSON.stringify(state.context.recipe);
  assert.equal(state.click(state.compose), true);
  assert.equal(new URL(state.entries.at(-1)).searchParams.get('view'), 'compose');
  assert.equal(new URL(state.entries.at(-1)).searchParams.get('campaign'), 'test');
  state.click(state.compose);
  assert.equal(state.entries.length, 2, 'same route does not duplicate history');
  state.click(state.navigation.find(control => control.dataset.view === 'pipeline'));
  state.click(state.home);
  assert.equal(state.context.view, 'learn');
  assert.equal(new URL(state.entries.at(-1)).searchParams.has('view'), false);
  assert.equal(state.headings.headline.focused, true);
  state.back();
  assert.equal(state.context.view, 'pipeline');
  state.back();
  assert.equal(state.context.view, 'compose');
  state.forward();
  assert.equal(state.context.view, 'pipeline');
  assert.equal(JSON.stringify(state.context.recipe), before);
  assert.equal(state.context.pipelineProvider, 'gitlab');
  assert.equal(state.context.tab, 'build');
});

test('brand returns to root from an index.html deep link', () => {
  const state = app('https://imagecraft.test/index.html?view=build');
  state.click(state.home);
  assert.equal(state.entries.at(-1), 'https://imagecraft.test/');
});

test('modified link clicks retain native new-tab/window behavior', () => {
  for (const modifiers of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
    const state = app();
    assert.equal(state.click(state.compose, modifiers), false);
    assert.equal(state.entries.length, 1);
  }
});

test('landing and brand expose real, keyboard-accessible links', () => {
  assert.match(html, /<a class="brand" href="\/" data-view="learn" aria-label="Imagecraft home — Understand">/);
  assert.match(html, /<a class="button primary" href="\?view=compose" data-view="compose">Start composing →<\/a>/);
  assert.match(html, /<a href="\?view=pipeline" data-view="pipeline">Pipeline →<\/a>/);
  assert.match(html, /showView\(viewFromUrl\(\)\);\s*<\/script>/);
});
