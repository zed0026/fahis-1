const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '../dcom_tool_src');
const dst = path.join(__dirname, '../../windows_dcom_tool');

const map = {
  'getsystem_potato_types.go': 'potato_types.go',
  'getsystem_potato_hook.go': 'potato_hook.go',
  'getsystem_potato_oxid.go': 'potato_oxid.go',
  'getsystem_potato_token.go': 'potato_token.go',
  'getsystem_potato.go': 'potato_core.go',
};

function cleanGo(t) {
  let out = t.replace(/^package commands/m, 'package main');
  out = out.replace(/import \(\s*\n(?:\s*"fawkes[^"]*"\s*\n)+/g, 'import (\n');
  out = out.replace(/\n\s*"fawkes[^"]*"/g, '');
  return out;
}

for (const [from, to] of Object.entries(map)) {
  const t = cleanGo(fs.readFileSync(path.join(src, from), 'utf8'));
  fs.writeFileSync(path.join(dst, to), t);
}

const h = fs.readFileSync(path.join(src, 'handles.go'), 'utf8');
const qStart = h.indexOf('const (');
const qEnd = h.indexOf('func queryObjectType');
const body = h.slice(qStart, qEnd);
const handles = `//go:build windows

package main

import (
	"fmt"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
)

${body.replace('systemHandleInformation  = 16', 'systemExtendedHandleInformation = 0x40')}
`;
fs.writeFileSync(path.join(dst, 'handles_query.go'), handles);

console.log('ported', Object.keys(map).length, 'files + handles');
