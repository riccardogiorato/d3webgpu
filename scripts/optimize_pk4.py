#!/usr/bin/env python3
"""
Optimize the Doom 3 demo pk4 for web delivery.

Phase 2a: Remove unused DDS files (the d3wasm WebGL engine never loads DDS).
Phase 2b: Convert alpha-less TGA textures to high-quality JPG
          (the engine already has a TGA→JPG fallback in R_LoadImage).

Usage:
  python3 scripts/optimize_pk4.py [input.pk4] [output.pk4]

Defaults:
  input:  build-wasm/data/demo/demo00.pk4
  output: build-wasm/data/demo/demo00_optimized.pk4
"""
import zipfile, os, sys, io, time
from PIL import Image

src = sys.argv[1] if len(sys.argv) > 1 else 'build-wasm/data/demo/demo00.pk4'
dst = sys.argv[2] if len(sys.argv) > 2 else 'build-wasm/data/demo/demo00_optimized.pk4'

print(f"Optimizing: {src} -> {dst}")
t0 = time.time()

z_in = zipfile.ZipFile(src, 'r')
z_out = zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED, compresslevel=6)

stats = {
    'dds_removed': 0, 'tga_to_jpg': 0, 'tga_kept_alpha': 0,
    'tga_error': 0, 'other_copied': 0
}
uc_before = 0  # uncompressed bytes
uc_after = 0

total = len(z_in.infolist())
for idx, item in enumerate(z_in.infolist()):
    name = item.filename

    if item.is_dir():
        if not name.startswith('dds/'):
            z_out.writestr(item, '')
        continue

    data = z_in.read(name)
    uc_before += len(data)

    # Skip DDS files (dead weight — engine never loads them)
    if name.endswith('.dds') or name.startswith('dds/'):
        stats['dds_removed'] += 1
        continue

    lname = name.lower()

    if lname.endswith('.tga'):
        try:
            img = Image.open(io.BytesIO(data))
            has_alpha = (img.mode in ('RGBA', 'LA') or
                         (img.mode == 'P' and 'transparency' in img.info))
            if has_alpha:
                # Keep TGA with alpha as-is (Phase 2c will convert to KTX2)
                z_out.writestr(name, data)
                uc_after += len(data)
                stats['tga_kept_alpha'] += 1
            else:
                # Convert to high-quality JPG
                if img.mode != 'RGB':
                    img = img.convert('RGB')
                buf = io.BytesIO()
                img.save(buf, 'JPEG', quality=92)
                jpg_data = buf.getvalue()
                jpg_name = name[:-4] + '.jpg'
                z_out.writestr(jpg_name, jpg_data)
                uc_after += len(jpg_data)
                stats['tga_to_jpg'] += 1
        except Exception as e:
            # If Pillow can't decode it, keep the original
            z_out.writestr(name, data)
            uc_after += len(data)
            stats['tga_error'] += 1
    else:
        z_out.writestr(name, data)
        uc_after += len(data)
        stats['other_copied'] += 1

    if (idx + 1) % 1000 == 0:
        print(f"  ...{idx+1}/{total} files processed ({time.time()-t0:.0f}s)")

z_in.close()
z_out.close()

src_sz = os.path.getsize(src)
dst_sz = os.path.getsize(dst)

print(f"\nDone in {time.time()-t0:.0f}s")
print(f"\nConversion stats:")
print(f"  DDS removed:        {stats['dds_removed']}")
print(f"  TGA -> JPG:          {stats['tga_to_jpg']}")
print(f"  TGA kept (alpha):   {stats['tga_kept_alpha']}")
print(f"  TGA errors (kept):   {stats['tga_error']}")
print(f"  Other files copied:  {stats['other_copied']}")
print(f"\nUncompressed: {uc_before/1024/1024:.1f} MB -> {uc_after/1024/1024:.1f} MB")
print(f"Compressed:   {src_sz/1024/1024:.1f} MB -> {dst_sz/1024/1024:.1f} MB")
print(f"Savings:      {(src_sz-dst_sz)/1024/1024:.1f} MB ({(1-dst_sz/src_sz)*100:.1f}%)")
