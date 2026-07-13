#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const files = {
  app: path.join(root, "public", "app.js"),
  css: path.join(root, "public", "styles.css"),
  html: path.join(root, "public", "index.html"),
  server: path.join(root, "server.js"),
};

const report = [];

function read(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
}

function add(level, title, detail, file, hint) {
  report.push({ level, title, detail, file, hint });
}

function runStep(name, command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    shell: false,
    encoding: "utf8",
  });

  if (result.status === 0) {
    add("pass", name, "Completed successfully.");
    return true;
  }

  const detail = result.error
    ? result.error.message
    : (result.stderr || result.stdout || "Command failed.").trim();
  add("fail", name, detail, undefined, `${command} ${args.join(" ")}`);
  return false;
}

function runNodeChecks() {
  const checkTargets = ["server.js", "public/app.js", "tests/integration.test.js"];
  for (const target of checkTargets) {
    if (!runStep(`Syntax check: ${target}`, process.execPath, ["--check", target])) return false;
  }
  return true;
}

function lineOfIndex(source, index) {
  if (index === -1) return null;
  return source.slice(0, index).split(/\r?\n/).length;
}

function countMatches(source, pattern) {
  return Array.from(source.matchAll(pattern)).length;
}

function auditCss(css) {
  if (!css.trim()) {
    add("fail", "CSS file missing", "public/styles.css could not be read.", files.css);
    return;
  }

  const transitionAll = Array.from(css.matchAll(/transition\s*:\s*[^;]*\ball\b[^;]*;/gi));
  transitionAll.slice(0, 8).forEach((match) => {
    add(
      "warn",
      "Avoid transition: all",
      "Animating every property can cause flicker, unexpected page shifts, and janky mobile gestures.",
      `${files.css}:${lineOfIndex(css, match.index)}`,
      "Transition transform, opacity, color, background-color, or box-shadow explicitly."
    );
  });

  if (!/@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/i.test(css)) {
    add(
      "warn",
      "Reduced-motion fallback missing",
      "The app has many route and overlay animations, so it should respect users who reduce motion.",
      files.css,
      "Add a prefers-reduced-motion block that shortens animation-duration and transition-duration."
    );
  }

  const vhUsage = Array.from(css.matchAll(/(?:height|min-height|max-height)\s*:\s*[^;]*\b100vh\b[^;]*;/gi));
  vhUsage.slice(0, 10).forEach((match) => {
    add(
      "warn",
      "100vh can break iPhone keyboard layout",
      "iOS browser chrome and the keyboard often make 100vh push the app upward.",
      `${files.css}:${lineOfIndex(css, match.index)}`,
      "Prefer 100dvh with a min-height fallback or use the existing visual viewport app height variable."
    );
  });

  const keyframes = Array.from(css.matchAll(/@keyframes\s+([a-zA-Z0-9_-]+)\s*\{([\s\S]*?)\n\}/g));
  keyframes.forEach((match) => {
    const body = match[2];
    const layoutProperties = body.match(/\b(width|height|top|right|bottom|left|margin|padding|font-size|line-height)\s*:/g);
    if (layoutProperties) {
      add(
        "warn",
        "Layout-affecting keyframes",
        `@keyframes ${match[1]} animates ${Array.from(new Set(layoutProperties)).join(", ")}.`,
        `${files.css}:${lineOfIndex(css, match.index)}`,
        "Prefer transform and opacity for smooth mobile animations."
      );
    }
  });

  const duplicateKeyframes = Array.from(css.matchAll(/@keyframes\s+([a-zA-Z0-9_-]+)/g)).map((match) => match[1]);
  const seen = new Set();
  duplicateKeyframes.forEach((name) => {
    if (seen.has(name)) {
      add(
        "warn",
        "Duplicate keyframes",
        `@keyframes ${name} is defined more than once.`,
        files.css,
        "Merge or rename duplicate keyframes to avoid surprising animation changes."
      );
    }
    seen.add(name);
  });

  const importantCount = countMatches(css, /!important/g);
  if (importantCount > 12) {
    add(
      "note",
      "Many !important rules",
      `${importantCount} !important rules found. They make UI polish changes harder to reason about.`,
      files.css,
      "When touching nearby styles, replace them with clearer selector ownership."
    );
  }
}

function auditJs(app) {
  if (!app.trim()) {
    add("fail", "App file missing", "public/app.js could not be read.", files.app);
    return;
  }

  const renderCalls = countMatches(app, /\brender[A-Z][A-Za-z0-9_]*\s*\(/g);
  if (renderCalls > 180) {
    add(
      "note",
      "High render-call density",
      `${renderCalls} render calls found. This app is large enough that rerendering can cause scroll jumps.`,
      files.app,
      "Prefer in-place DOM updates for modals, pickers, reactions, and chat controls."
    );
  }

  const scrollMatches = Array.from(app.matchAll(/scroll(?:Top|To|IntoView)\b[^;\n]*/g));
  scrollMatches.slice(0, 12).forEach((match) => {
    add(
      "note",
      "Scroll behavior checkpoint",
      "This scroll call can affect chat position or route-back smoothness.",
      `${files.app}:${lineOfIndex(app, match.index)}`,
      "Only auto-scroll when opening a chat, receiving a new bottom message, or after an explicit user send."
    );
  });
  if (scrollMatches.length > 12) {
    add(
      "note",
      "More scroll calls hidden",
      `${scrollMatches.length - 12} additional scroll calls were omitted to keep the report readable.`,
      files.app
    );
  }

  if (!/visualViewport/.test(app)) {
    add(
      "warn",
      "Visual viewport handling missing",
      "Mobile keyboards can move fixed controls unless visualViewport is handled.",
      files.app,
      "Use window.visualViewport to update CSS app height and keyboard-safe offsets."
    );
  }

  if (!/(pointercancel|touchcancel)/.test(app)) {
    add(
      "warn",
      "Gesture cancel handlers missing",
      "Swipe/reply gestures should clean up when the browser cancels a touch.",
      files.app,
      "Handle pointercancel or touchcancel anywhere pointerdown/move/up gestures are used."
    );
  }

  const directInnerHtml = Array.from(app.matchAll(/\.innerHTML\s*=/g));
  if (directInnerHtml.length > 0) {
    add(
      "note",
      "innerHTML usage",
      `${directInnerHtml.length} assignments found. These can reset focus, scroll, and media playback when used inside active UI.`,
      files.app,
      "For frequently opened panels, update specific nodes instead of replacing larger containers."
    );
  }

  if (!/requestAnimationFrame/.test(app)) {
    add(
      "warn",
      "Animation frame coordination missing",
      "Route/chat animations are easier to keep smooth when DOM writes are batched.",
      files.app,
      "Use requestAnimationFrame around layout-sensitive class changes and scroll settling."
    );
  }
}

function auditHtml(html) {
  if (!/viewport-fit=cover/.test(html)) {
    add(
      "warn",
      "Safe-area viewport missing",
      "iPhone full-screen layouts need viewport-fit=cover for correct top/bottom insets.",
      files.html,
      "Add viewport-fit=cover to the viewport meta tag."
    );
  }
}

function printReport() {
  const order = { fail: 0, warn: 1, note: 2, pass: 3 };
  report.sort((a, b) => order[a.level] - order[b.level] || a.title.localeCompare(b.title));

  console.log("\nUI polish audit\n===============");
  for (const item of report) {
    const prefix = item.level.toUpperCase().padEnd(4);
    console.log(`\n[${prefix}] ${item.title}`);
    console.log(`  ${item.detail}`);
    if (item.file) console.log(`  File: ${item.file}`);
    if (item.hint) console.log(`  Hint: ${item.hint}`);
  }

  const failures = report.filter((item) => item.level === "fail").length;
  const warnings = report.filter((item) => item.level === "warn").length;
  const notes = report.filter((item) => item.level === "note").length;

  console.log(`\nSummary: ${failures} failures, ${warnings} warnings, ${notes} notes.`);
  if (failures > 0) process.exitCode = 1;
}

runNodeChecks();
runStep("Integration tests", process.execPath, ["--test", "tests/integration.test.js"]);
auditCss(read(files.css));
auditJs(read(files.app));
auditHtml(read(files.html));
printReport();
