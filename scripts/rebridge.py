"""Publish every module's exports on window, from main.js.

The markup calls handlers by name in on* attributes, and those resolve against
window. Before the split this was a classic script where every top-level function
was already a window property, so the bridge restores exactly that. It is not a
list: picking names by scanning for on*="..." missed the filter menus, which build
"pickCat('x')" as a string that only becomes an attribute when rendered.

Namespace imports rather than named ones, so nothing has to be enumerated and
nothing can be forgotten. Scaffolding: this shrinks as each view moves to
delegated listeners, which the record detail modal already demonstrates.
"""
import io, re, glob, os

MAIN = 'frontend/src/main.js'
BEGIN = '/* ---- window bridge ---- '
END = '/* ---- end window bridge ---- */'

text = io.open(MAIN, encoding='utf-8', newline='').read().replace('\r\n', '\n')
text = re.sub(re.escape(BEGIN) + r'[\s\S]*?' + re.escape(END) + r'\n*', '', text)
# and any earlier hand-written bridge
text = re.sub(r'\n*/\* Inline on\* attributes[\s\S]*?\n\}\);\n', '\n', text)
text = re.sub(r'\n*/\* The markup calls these by name[\s\S]*?\n\}\);\n', '\n', text)

mods = sorted(p.replace(os.sep, '/') for pat in ('frontend/src/**/*.js', 'tests/**/*.js')
              for p in glob.glob(pat, recursive=True))
mods = [m for m in mods if m != MAIN]

def alias(path):
    stem = os.path.splitext(os.path.basename(path))[0]
    folder = os.path.basename(os.path.dirname(path))
    a = (folder + '_' + stem) if folder not in ('src',) else stem
    return re.sub(r'[^A-Za-z0-9_]', '_', a)

imports, names = [], []
for m in mods:
    a = alias(m)
    rel = os.path.relpath(m, os.path.dirname(MAIN)).replace(os.sep, '/')
    if not rel.startswith('.'):
        rel = './' + rel
    imports.append('import * as %s from %r;' % (a, rel))
    names.append(a)

# main.js cannot import itself, so its own functions are named directly
own = sorted(set(re.findall(r'^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)',
                            text, re.M)))

block = (BEGIN + '''
   The markup calls handlers by name from inline on* attributes, which resolve
   against window - and a module has its own scope. Before this file was split
   every top-level function was already a window property, so this restores what
   the markup has always been calling, without a list that can be wrong: the
   filter menus build "pickCat('x')" as a string, and no attribute scan finds it.

   Scaffolding. Entries disappear as each view moves to delegated listeners. */
''' + '\n'.join(imports) + '\nObject.assign(window, ' + ', '.join(names) + ');\n'
         + ('Object.assign(window, { ' + ', '.join(own) + ' });\n' if own else '')
         + END + '\n')

anchor = '\ninitApp();'
if text.count(anchor) != 1:
    raise SystemExit('!! expected exactly one initApp() call, found %d' % text.count(anchor))
text = text.replace(anchor, '\n' + block + '\ninitApp();')
io.open(MAIN, 'w', encoding='utf-8', newline='').write(text)
print('bridged %d modules by namespace' % len(mods))
