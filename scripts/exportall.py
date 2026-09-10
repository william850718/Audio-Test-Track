import io, re, glob, os

IMPORT = re.compile(r'^import \{[^}]*\} from [^\n]*\n', re.M)
EXPORT = re.compile(r'\n*^/\* Everything this module declares[\s\S]*?\n\};\n*|\n*^export \{[^}]*\};\n*', re.M)
DECL   = re.compile(r'^(?:async\s+function|function|const|let|var)\s+([A-Za-z_$][\w$]*)', re.M)
INLINE = re.compile(r'^export\s+(?:async\s+function|function|const|let|var)\s', re.M)

NOTE = ('\n\n/* Everything this module declares. These are internal modules rather than a public\n'
        '   API, so exporting the lot removes a whole class of "forgot to export it" error;\n'
        '   the import side is generated too, and over-importing costs nothing. */\nexport {\n')

for m in sorted(p.replace(os.sep, '/') for p in glob.glob('frontend/src/**/*.js', recursive=True)):
    s = io.open(m, encoding='utf-8', newline='').read()
    head = IMPORT.findall(s)
    core = EXPORT.sub('\n', IMPORT.sub('', s)).strip('\n')
    if INLINE.search(core):        # already exports inline; leave it alone
        print('  %-42s inline exports' % m); continue
    names = sorted(set(DECL.findall(core)))
    out = (''.join(head) + '\n' if head else '') + core + NOTE
    line = '  '
    for n in names:
        if len(line) + len(n) + 2 > 94:
            out += line.rstrip() + '\n'; line = '  '
        line += n + ', '
    out += line.rstrip().rstrip(',') + '\n};\n'
    io.open(m, 'w', encoding='utf-8', newline='').write(out)
    print('  %-42s exports %d' % (m, len(names)))
