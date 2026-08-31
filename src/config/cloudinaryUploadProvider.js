import { BaseProvider } from '@adminjs/upload';
import cloudinary from './cloudinary.js';
import { CLOUDINARY_CLOUD_NAME } from './config.js';

const withoutFileExtension = (key) => key.replace(/\.[^./]+$/, '');

export default class CloudinaryUploadProvider extends BaseProvider {
  constructor() {
    super('villagefress-banners');
  }

  async upload(file, key) {
    const options = {
      // Cloudinary treats the final extension as the delivery format. Keeping
      // it in public_id would require URLs such as "banner.png.png".
      public_id: withoutFileExtension(key),
      resource_type: 'image',
      overwrite: true,
    };

    if (file.path) {
      return cloudinary.uploader.upload(file.path, options);
    }

    return new Promise((resolve, reject) => {
      const upload = cloudinary.uploader.upload_stream(options, (error, result) => {
        if (error) reject(error);
        else resolve(result);
      });

      if (file.uploadBuffer) {
        upload.end(file.uploadBuffer);
        return;
      }

      file.on('error', reject);
      file.pipe(upload);
    });
  }

  async delete(key) {
    return cloudinary.uploader.destroy(withoutFileExtension(key), { resource_type: 'image' });
  }

  path(key) {
    return `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/upload/${key}`;
  }
}
