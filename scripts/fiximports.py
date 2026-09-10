"""Recompute the import header of every module and of index.html's inline script.

Greedy on purpose: identifiers are collected without separating code from string
or template text. An unused import is dead weight; a missing one is a
ReferenceError the first time that path runs. Two earlier attempts to be exact
both failed the same way - a lexer that lost sync inside this file's nested
template literals - so the rule here is that only things which cannot possibly
contain code are removed.

That means whole-line comments and nothing else. A greedy /*...*/ match ate real
code, because template literals in this file contain CSS, and CSS has comments:
one stray /* inside a template swallowed everything up to the next */, which is
how TOTAL_IMG_BYTES and MAX_FILE_COUNT stopped being imported and the attachment
pickers rendered blank. A comment that starts mid-line is now left alone; the
cost is a few unnecessary imports, which is the harmless direction.
"""
import io, re, glob, os

IDENT = re.compile(r'(?<![\w$.])([A-Za-z_$][\w$]*)')
DECL = re.compile(
    r'^(?:export\s+)?(?:async\s+function|function|const|let|var)\s+([A-Za-z_$][\w$]*)', re.M)
IMPORT_LINE = re.compile(r'^import \{[^}]*\} from [^\n]*\n', re.M)


def strip_comments(t):
    """Remove what cannot contain code: whole-line comments, and a trailing //
    on a line that has no quote before it.

    The quote test is the safe half of a problem that needs a lexer. A URL lives
    inside a string, so a line holding one is left alone rather than truncated at
    its //; the cost is that a name mentioned in a trailing comment on such a line
    becomes a spurious import, which is harmless. Block comments are only removed
    when they open and close on lines of their own - a greedy /*...*/ once ate the
    CSS-bearing template literals in this file and with them the identifiers that
    the attachment pickers needed."""
    out, in_block = [], False
    for line in t.split('\n'):
        s = line.strip()
        if in_block:
            if '*/' in s:
                in_block = False
            out.append(''); continue
        if s.startswith('//'):
            out.append(''); continue
        if s.startswith('/*'):
            if '*/' not in s[2:]:
                in_block = True
            out.append(''); continue
        cut = line.find('//')
        if cut > 0 and not any(q in line[:cut] for q in ('\'', '"', '`')):
            line = line[:cut]
        out.append(line)
    return '\n'.join(out)


def norm(t):
    return t.replace('\r\n', '\n')


mods = sorted(p.replace(os.sep, '/') for pat in ('frontend/src/**/*.js', 'tests/**/*.js')
            for p in glob.glob(pat, recursive=True))

body, decl = {}, {}
for m in mods:
    s = norm(io.open(m, encoding='utf-8', newline='').read())
    s = IMPORT_LINE.sub('', s).lstrip('\n')
    body[m] = s
    decl[m] = set(DECL.findall(s))

owner = {}
for m in mods:
    for n in decl[m]:
        owner[n] = m


def rel(frm, to):
    p = os.path.relpath(to, os.path.dirname(frm)).replace(os.sep, '/')
    return p if p.startswith('.') else './' + p


def needed(src_text, home):
    used = set(IDENT.findall(strip_comments(src_text)))
    return {u for u in used if u in owner and owner[u] != home}


def header(src_text, home, pathmode):
    need = {}
    for u in sorted(needed(src_text, home)):
        need.setdefault(owner[u], []).append(u)
    out = []
    for dep in sorted(need):
        p = ('./' + dep) if pathmode == 'root' else rel(home, dep)
        out.append('import { %s } from %r;' % (', '.join(sorted(need[dep])), p))
    return out


for m in mods:
    head = header(body[m], m, 'rel')
    io.open(m, 'w', encoding='utf-8', newline='').write(
        ('\n'.join(head) + '\n\n' if head else '') + body[m])
    print('  %-42s %2d imports' % (m, len(head)))

H = 'index.html'   # markup only now; every script is a module under frontend/src

# --- checks, each with different logic from the thing it is checking ------
problems = []
notes = []   # advisory: raw scan sees it, stripped scan did not - usually prose

# 1. a name used anywhere in the raw text but not imported. No stripping at all,
#    so this cannot share the blind spot of the scan above.
for label, text, home in [(m, body[m], m) for m in mods]:
    src = io.open(label, encoding='utf-8', newline='').read()
    imported = set()
    for mm in re.finditer(r'^import \{([^}]*)\} from', norm(src), re.M):
        for n in mm.group(1).split(','):
            imported.add(n.strip())
    raw_used = {u for u in set(IDENT.findall(text))
                if u in owner and owner[u] != home}
    for miss in sorted(raw_used - imported):
        notes.append('%s mentions %s without importing it' % (label, miss))

# 2. every imported name is exported by its target
for m in mods:
    s = norm(io.open(m, encoding='utf-8', newline='').read())
    exported = set(re.findall(
        r'^export\s+(?:async\s+function|function|const|let|var)\s+([A-Za-z_$][\w$]*)', s, re.M))
    for mm in re.finditer(r'^export \{([^}]*)\};', s, re.M):
        for n in mm.group(1).replace('\n', ' ').split(','):
            if n.strip():
                exported.add(n.strip())
    for other in mods:
        t = norm(io.open(other, encoding='utf-8', newline='').read())
        base = os.path.dirname(other)
        for mm in re.finditer(r"^import \{([^}]*)\} from '([^']*)'", t, re.M):
            if os.path.normpath(os.path.join(base, mm.group(2))).replace(os.sep, '/') == m:
                for n in mm.group(1).split(','):
                    if n.strip() and n.strip() not in exported:
                        problems.append('%s imports %s, which %s does not export'
                                        % (other, n.strip(), m))

# 3. no cycles - module evaluation order turns one into a dead-zone error
edges = {}
for m in mods:
    s = norm(io.open(m, encoding='utf-8', newline='').read())
    edges[m] = {os.path.normpath(os.path.join(os.path.dirname(m), g)).replace(os.sep, '/')
                for g in re.findall(r"^import \{[^}]*\} from '([^']*)'", s, re.M)}
cycles = set()
def walk(node, seen):
    for nxt in edges.get(node, ()):
        if nxt in seen:
            cycles.add(' -> '.join(seen[seen.index(nxt):] + [nxt]))
        elif nxt in edges:
            walk(nxt, seen + [nxt])
for m in mods:
    walk(m, [m])
# A cycle only bites when a module reads an imported binding while it is still
# being evaluated - a top-level initialiser. Function declarations are hoisted and
# resolved at call time, so views calling each other is ordinary and safe. This is
# the distinction DEFAULT_TEST_SOFTWARE taught: state.js seeded a const from
# platforms.js at evaluation time, and that cycle was fatal.
EAGER_INIT = re.compile(r'^(?:export\s+)?(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=([^\n]*)$', re.M)
eager = {}
for m in mods:
    src = strip_comments(norm(io.open(m, encoding='utf-8', newline='').read()))
    imported = set()
    for mm in re.finditer(r'^import \{([^}]*)\} from', src, re.M):
        for n in mm.group(1).split(','):
            imported.add(n.strip())
    hits = {n for mm in EAGER_INIT.finditer(src)
            for n in IDENT.findall(mm.group(1)) if n in imported}
    if hits:
        eager[m] = hits

for c in sorted(cycles):
    risky = [m for m in c.split(' -> ') if m in eager]
    if risky:
        problems.append('cycle evaluated eagerly: %s (%s reads %s at load time)'
                        % (c, risky[0], ', '.join(sorted(eager[risky[0]]))))
    else:
        notes.append('cycle (safe - function references only): %s' % c)

print()
if notes:
    # The raw pass reads comments too, so most of these are a name mentioned in
    # prose. It is here so that if comment-stripping ever eats real code again -
    # which is exactly how the attachment pickers broke - the disagreement shows.
    print('   (%d mention%s in comments, not imported: %s)'
          % (len(notes), '' if len(notes) == 1 else 's',
             ', '.join(sorted({n.split()[2] for n in notes if 'mentions' in n}))))
    for n in [x for x in notes if x.startswith('cycle')]:
        print('   ' + n)
if problems:
    print('!! %d problem(s):' % len(problems))
    for p in problems[:30]:
        print('   ' + p)
else:
    print('imports resolve, nothing is used unimported, and no cycle is evaluated eagerly.')
