// node -r neon_shim.js 옛시험.js … — 옛 메신저봇R 판 시험을 StarLight(NeonJS) 판 본체에 그대로 돌린다.
// vm.runInContext 로 본체를 실행하는 부분을 가로채서:
//   ① "export default function" 을 엄격 모드 함수로 바꿔 실행하고 (NeonJS 는 strict 모듈)
//   ② 시험이 만든 가짜 FileStream·BotManager 로 __PLAT__ 을 만들어 넘기고
//   ③ 본체 안의 최상위 변수·함수를 ctx 의 속성(get/set)으로 열어 준다 (c.DATA_FILE, c.ALARM_TIMER = "test" 등)
var vm = require('vm');
var orig = vm.runInContext;
vm.runInContext = function (code, ctx) {
    if (typeof code !== 'string' || code.indexOf('export default function') === -1) return orig.apply(vm, arguments);
    var names = {};
    code.split('\n').forEach(function (l) {
        var m = /^(?:var|function|async function)\s+([A-Za-z_$][\w$]*)/.exec(l);
        if (m) names[m[1]] = true;
    });
    var src = code
        .replace(/export default function (\w+)\(([^)]*)\) \{/, '__BODY__ = function $1($2) { "use strict";')
        .replace('return {\n    response: ',
            'return {\n    __get: function (n) { return eval(n); },\n    __set: function (n, v) { eval(n + " = v"); },\n    response: ');
    orig.call(vm, src, ctx);
    var fsx = ctx.FileStream;
    var plat = {
        read: function (n) { return fsx ? fsx.read(n) : null; },
        write: function (n, t) { if (fsx) fsx.write(n, t); return !!fsx; },
        send: function (room, text) {
            try { var b = ctx.BotManager && ctx.BotManager.getCurrentBot(); if (b) { b.send(room, text); return true; } } catch (e) {}
            return false;
        },
        fetch: ctx.fetch,
        setTimeout: ctx.setTimeout || setTimeout,
        setInterval: function () { return 0; }   // 시험은 alarmTick 을 직접 부른다
    };
    var bot = ctx.__BODY__(null, null, plat);
    Object.keys(names).forEach(function (n) {
        Object.defineProperty(ctx, n, {
            configurable: true, enumerable: true,
            get: function () { return bot.__get(n); },
            set: function (v) { bot.__set(n, v); }
        });
    });
    ctx.__BOT__ = bot;
    return undefined;
};
