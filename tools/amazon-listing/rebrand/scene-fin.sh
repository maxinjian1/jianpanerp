#!/bin/bash
# scene-fin.sh <key> <png1> <png2>  … plan.json の cap1/cap2 で文字入れ → out/rebrand/scene/<key>/up/s1.jpg s2.jpg
set -e
S=/c/Users/maxinjian/source/jianpanerp/tools/amazon-listing/out/rebrand/scene
k=$1; d=$S/$k; mkdir -p $d; cd $d
[ -n "$2" ] && cp "$2" g1.png; [ -n "$3" ] && cp "$3" g2.png
node -e "
const p=require('C:/Users/maxinjian/source/jianpanerp/tools/amazon-listing/out/rebrand/scene/plan.json').find(x=>x.key==='$k');
const s=[];if(require('fs').existsSync('g1.png'))s.push({src:'g1.png',out:'s1.jpg',layout:'caption',text:p.cap1});if(require('fs').existsSync('g2.png'))s.push({src:'g2.png',out:'s2.jpg',layout:'caption',text:p.cap2});
require('fs').writeFileSync('spec.json',JSON.stringify(s));"
/c/Users/maxinjian/source/jianpanerp/apps/ai-service/venv/Scripts/python.exe /c/Users/maxinjian/source/jianpanerp/tools/rakuten/img-text.py spec.json >/dev/null
ls up
