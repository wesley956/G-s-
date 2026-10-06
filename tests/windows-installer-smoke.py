import hashlib, json, pathlib, sqlite3, sys, time, uuid
from contextlib import closing
root = pathlib.Path(sys.argv[1])
mode = sys.argv[2] if len(sys.argv) > 2 else 'validate'
live = root / 'deposito.db'
def connect(path):
    return sqlite3.connect(f'file:{path.as_posix()}?mode=ro', uri=True)
if mode == 'prepare-restore':
    # The installed app is stopped. Simulate data committed after its first backup.
    with sqlite3.connect(live) as db:
        db.execute("INSERT INTO customers(id,name) VALUES ('smoke-before-restore','Dado atual')")
        db.commit()
        db.execute('PRAGMA wal_checkpoint(TRUNCATE)')
    source = next((root / 'backups').glob('*.sqlite'))
    stage = root / 'restore-pending.sqlite'
    with closing(connect(source)) as copy, closing(sqlite3.connect(stage)) as target:
        copy.backup(target)
    marker = {'sha256': hashlib.sha256(stage.read_bytes()).hexdigest(),
              'preventive_backup_id': f'gs-backup-{int(time.time()*1000)}-{uuid.uuid4()}.sqlite'}
    (root / 'restore-pending.json').write_text(json.dumps(marker))
    (root / 'smoke-preventive.json').write_text(json.dumps(marker))
    print('Prepared a valid pending restore with real SQLx migration checksums')
elif mode == 'verify-restore':
    assert not (root / 'restore-pending.json').exists(), 'Recovery marker was not consumed'
    with connect(live) as db:
        assert db.execute("SELECT COUNT(*) FROM customers WHERE id='smoke-before-restore'").fetchone()[0] == 0
    marker = json.loads((root / 'smoke-preventive.json').read_text())
    with connect(root / 'backups' / marker['preventive_backup_id']) as copy:
        assert copy.execute("SELECT COUNT(*) FROM customers WHERE id='smoke-before-restore'").fetchone()[0] == 1
        assert copy.execute('PRAGMA quick_check').fetchone()[0] == 'ok'
    print('PASS: real installed startup restored the backup and kept a preventive copy')
elif mode == 'seed-reinstall':
    with sqlite3.connect(live) as db:
        db.execute("INSERT INTO customers(id,name) VALUES ('smoke-reinstall','Dado preservado')")
        db.commit()
        db.execute('PRAGMA wal_checkpoint(TRUNCATE)')
elif mode == 'verify-reinstall':
    with connect(live) as db:
        assert db.execute("SELECT COUNT(*) FROM customers WHERE id='smoke-reinstall'").fetchone()[0] == 1
    print('PASS: reinstall preserves the existing local database')
else:
    with connect(live) as db:
        assert db.execute('PRAGMA quick_check').fetchone()[0] == 'ok'
        assert db.execute('SELECT MAX(version) FROM _sqlx_migrations WHERE success=1').fetchone()[0] == 4
        assert db.execute('SELECT COUNT(*) FROM categories').fetchone()[0] == 7
    for path in (root / 'backups').glob('*.sqlite'):
        with connect(path) as copy:
            assert copy.execute('PRAGMA quick_check').fetchone()[0] == 'ok'
            assert copy.execute('SELECT COUNT(*) FROM categories').fetchone()[0] == 7
    print('PASS: installed database and automatic backup reopen independently')
