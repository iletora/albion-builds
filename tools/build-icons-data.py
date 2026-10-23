# Regenerates icons-data.js (embedded icons for PNG export when index.html is opened as a local file).
# Run from the repo root after adding icons:  pip install pillow  &&  python tools/build-icons-data.py
from PIL import Image
import glob, io, base64, json
d = {}
for f in sorted(glob.glob('icons/items/*.png')) + sorted(glob.glob('icons/slots/*.png')):
    b = io.BytesIO(); Image.open(f).save(b, 'WEBP', quality=88, method=6)
    d[f.replace('\\', '/')] = 'data:image/webp;base64,' + base64.b64encode(b.getvalue()).decode()
open('icons-data.js', 'w').write(
    '// Embedded icons, used only when the page is opened as a local file (file://),\n'
    '// because browsers block exporting canvas images that use local files.\n'
    '// Regenerate with: python tools/build-icons-data.py\n'
    'window.ICON_DATA = ' + json.dumps(d, separators=(',', ':')) + ';\n')
print(len(d), 'icons')
