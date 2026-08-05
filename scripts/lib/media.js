'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * Заливка картинок из Sanity CDN в Media Library Strapi.
 * Имя файла детерминированное (originalFilename + короткий hash asset-id),
 * поэтому повторный прогон находит уже залитый файл и не плодит дубли.
 */
class MediaUploader {
  constructor(strapi, { dryRun = false, skipImages = false, log = console.log } = {}) {
    this.strapi = strapi;
    this.dryRun = dryRun;
    this.skipImages = skipImages;
    this.log = log;
    this.cache = new Map(); // sanity asset _id -> strapi file id
    this.stats = { uploaded: 0, reused: 0, failed: 0 };
  }

  /** Имя файла в Media Library: <slug оригинального имени>-<8 символов sha1 из sanity>.<ext> */
  fileNameFor(asset) {
    const sanityHash = (asset._id.match(/^image-([0-9a-f]+)-/) || [, ''])[1].slice(0, 8);
    const ext = asset.extension ? `.${asset.extension}` : path.extname(asset.originalFilename || '');
    const base = path
      .basename(asset.originalFilename || asset._id, ext)
      .toLowerCase()
      .replace(/[^a-z0-9а-яё._-]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'image';
    return `${base}-${sanityHash}${ext}`;
  }

  /**
   * @param {object} asset документ sanity.imageAsset
   * @returns {Promise<number|null>} id файла в Strapi
   */
  async ensure(asset) {
    if (!asset) return null;
    if (this.cache.has(asset._id)) return this.cache.get(asset._id);

    const name = this.fileNameFor(asset);
    const existing = await this.strapi.db
      .query('plugin::upload.file')
      .findOne({ where: { name }, select: ['id'] });
    if (existing) {
      this.cache.set(asset._id, existing.id);
      this.stats.reused += 1;
      return existing.id;
    }

    if (this.skipImages || this.dryRun) {
      this.cache.set(asset._id, null);
      return null;
    }

    let tmpFile = null;
    try {
      const response = await fetch(asset.url);
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
      const buffer = Buffer.from(await response.arrayBuffer());

      tmpFile = path.join(
        await fs.promises.mkdtemp(path.join(os.tmpdir(), 'studycz-media-')),
        name
      );
      await fs.promises.writeFile(tmpFile, buffer);

      const [file] = await this.strapi.plugin('upload').service('upload').upload({
        data: {
          fileInfo: {
            name,
            alternativeText: asset.originalFilename || name,
            caption: '',
          },
        },
        files: {
          filepath: tmpFile,
          originalFilename: name,
          mimetype: asset.mimeType || 'image/jpeg',
          size: buffer.length,
        },
      });

      this.cache.set(asset._id, file.id);
      this.stats.uploaded += 1;
      this.log(`    ↑ media ${name} (id ${file.id})`);
      return file.id;
    } catch (error) {
      this.stats.failed += 1;
      this.log(`    ! media ${name} — ошибка: ${error.message}`);
      this.cache.set(asset._id, null);
      return null;
    } finally {
      if (tmpFile) {
        await fs.promises.rm(path.dirname(tmpFile), { recursive: true, force: true }).catch(() => {});
      }
    }
  }
}

module.exports = { MediaUploader };
