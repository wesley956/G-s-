import pathlib, sqlite3, sys
root = pathlib.Path(sys.argv[1])
with sqlite3.connect(f'file:{(root / "deposito.db").as_posix()}?mode=ro', uri=True) as db:
    assert db.execute('PRAGMA quick_check').fetchone()[0] == 'ok'
    assert db.execute('SELECT MAX(version) FROM _sqlx_migrations WHERE success=1').fetchone()[0] == 4
    assert db.execute('SELECT COUNT(*) FROM categories').fetchone()[0] == 7
for path in (root / 'backups').glob('*.sqlite'):
    with sqlite3.connect(f'file:{path.as_posix()}?mode=ro', uri=True) as copy:
        assert copy.execute('PRAGMA quick_check').fetchone()[0] == 'ok'
        assert copy.execute('SELECT COUNT(*) FROM categories').fetchone()[0] == 7
print('PASS: installed database and automatic backup reopen independently')
