from pathlib import Path
import gzip, hashlib, json
vendor = Path('stardust/vendor')
assets = {}
for raw in [vendor/'hand_landmarker.task', *sorted((vendor/'wasm').glob('*.wasm'))]:
    data = raw.read_bytes()
    sha = hashlib.sha256(data).hexdigest()
    packed = gzip.compress(data, compresslevel=9, mtime=0)
    path = vendor/'packed'/(raw.stem+'-'+sha[:12]+'.bin')
    path.parent.mkdir(exist_ok=True)
    path.write_bytes(packed)
    assets[raw.name] = {'packed': path.relative_to(vendor).as_posix(), 'bytes': len(data), 'transfer': len(packed), 'sha256': sha}
    print(raw.name, len(data), '->', len(packed))
(vendor/'hand-assets.js').write_text('export const assets = '+json.dumps(assets,indent=2)+';\n')
