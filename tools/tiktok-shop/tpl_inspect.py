import sys, io, glob, openpyxl
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
for f in glob.glob(sys.argv[1] + '/*.xlsx'):
    wb = openpyxl.load_workbook(f)
    print('==', f, wb.sheetnames)
    ws = wb['Template']
    print('dims', ws.dimensions, 'validations', len(ws.data_validations.dataValidation))
    for dv in ws.data_validations.dataValidation[:12]:
        print('  DV', str(dv.sqref)[:30], dv.type, str(dv.formula1)[:90])
    for r in (2, 6, 7):
        print(' row', r, [str(c.value)[:60] if c.value is not None else None for c in ws[r]])
    for n in wb.sheetnames:
        s = wb[n]
        if n not in ('Template', 'Instruction', 'Image', 'Example'):
            vals = [[str(c.value)[:70] for c in row if c.value is not None] for row in s.iter_rows(min_row=1, max_row=6)]
            print('  sheet', n, s.sheet_state, s.dimensions, vals[:6])
