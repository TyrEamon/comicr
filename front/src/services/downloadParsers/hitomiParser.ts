import type { DownloadPlan, DownloadPlanPage } from '../downloadPlan'
import { nativeHttpService } from '../nativeHttpService'

interface HitomiFile {
  hash: string
  haswebp: number
  hasavif: number
  name: string
  width: number
  height: number
}

interface HitomiGalleryInfo {
  files: HitomiFile[]
  id: string
  title: string
}

export function isHitomiUrl(value: string) {
  try {
    const url = new URL(value)
    return url.hostname.toLowerCase().includes('hitomi.la') && /-\d+\.html$/i.test(url.pathname)
  } catch {
    return false
  }
}

export async function resolveHitomiDownloadPlan(pageUrl: string): Promise<DownloadPlan> {
  const id = pageUrl.match(/-(\d+)\.html$/i)?.[1]
  if (!id) {
    throw new Error('无法从 Hitomi 链接提取作品 ID')
  }

  const galleryInfo = await getGalleryInfo(id)
  const ggScript = await nativeHttpService.getText('https://ltn.gold-usergeneratedcontent.net/gg.js')
  const imageUrls = generateImageUrls(id, galleryInfo, ggScript)

  if (imageUrls.length === 0) {
    throw new Error('Hitomi 没有生成任何图片地址')
  }

  const pages: DownloadPlanPage[] = imageUrls.map((url, index) => {
    const file = galleryInfo.files[index]
    const extension = file?.haswebp === 0 ? extensionOf(file.name) : 'webp'
    return {
      url,
      name: `${String(index + 1).padStart(3, '0')}.${extension}`,
      referer: 'https://hitomi.la/',
      headers: { Referer: 'https://hitomi.la/' },
    }
  })

  return {
    source: 'hitomi',
    title: galleryInfo.title || `Hitomi ${id}`,
    pageUrl,
    pages,
  }
}

async function getGalleryInfo(id: string): Promise<HitomiGalleryInfo> {
  const script = await nativeHttpService.getText(`https://ltn.gold-usergeneratedcontent.net/galleries/${id}.js`)
  const match = script.match(/var galleryinfo = (.+);?/)
  if (!match?.[1]) {
    throw new Error('无法解析 Hitomi galleryinfo')
  }
  return JSON.parse(match[1].replace(/;\s*$/, '')) as HitomiGalleryInfo
}

function generateImageUrls(id: string, galleryInfo: HitomiGalleryInfo, ggScript: string) {
  const script = `
${ggScript}
var domain2 = 'gold-usergeneratedcontent.net';

function url_from_url_from_hash(galleryid, image, dir, ext, base) {
  if ('tn' === base) {
    return url_from_url('https://a.' + domain2 + '/' + dir + '/' + real_full_path_from_hash(image.hash) + '.' + ext, base);
  }
  return url_from_url(url_from_hash(galleryid, image, dir, ext), base, dir);
}

function real_full_path_from_hash(hash) {
  return hash.replace(/^.*(..)(.)$/, '$2/$1/' + hash);
}

function url_from_url(url, base, dir) {
  return url.replace(/\\/\\/..?\\.(?:gold-usergeneratedcontent\\.net|hitomi\\.la)\\//, '//' + subdomain_from_url(url, base, dir) + '.' + domain2 + '/');
}

function url_from_hash(galleryid, image, dir, ext) {
  ext = ext || dir || image.name.split('.').pop();
  if (dir === 'webp' || dir === 'avif') {
    dir = '';
  } else {
    dir += '/';
  }

  return 'https://a.' + domain2 + '/' + dir + full_path_from_hash(image.hash) + '.' + ext;
}

function full_path_from_hash(hash) {
  return gg.b + gg.s(hash) + '/' + hash;
}

function subdomain_from_url(url, base, dir) {
  var retval = '';
  if (!base) {
    if (dir === 'webp') {
      retval = 'w';
    } else if (dir === 'avif') {
      retval = 'a';
    }
  }

  var b = 16;
  var r = /\\/[0-9a-f]{61}([0-9a-f]{2})([0-9a-f])/;
  var m = r.exec(url);
  if (!m) {
    return retval;
  }

  var g = parseInt(m[2] + m[1], b);
  if (!isNaN(g)) {
    if (base) {
      retval = String.fromCharCode(97 + gg.m(g)) + base;
    } else {
      retval = retval + (1 + gg.m(g));
    }
  }

  return retval;
}

return files.map(function(file) {
  return url_from_url_from_hash(galleryId, file, 'webp');
});
`

  return new Function('galleryId', 'files', script)(id, galleryInfo.files) as string[]
}

function extensionOf(name: string) {
  return name.includes('.') ? name.split('.').pop() || 'jpg' : 'jpg'
}
