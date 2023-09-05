import axios from "axios";
import FormData from "form-data";
import jwt from "jsonwebtoken";
import fs from "fs";
import path from "path";

import type {
  GooglePhotosMediaItem,
  CreatePostDetailWithMediaItems,
  ProcessedImage,
  PostWithProcessedImages,
} from "~/types";

const imageDirectory = path.resolve(__dirname, "../_tmp_images");

/**
 * Downloads an image from a MediaItem in a Google Photos album to a file in the local filesystem
 * @param accessToken the Google Photos access token
 * @param mediaItem the MediaItem from a Google Photos album
 * @returns a Promise that resolves to an object containing:
 *  - `imagePath`: a string which is the path of the downloaded image
 *  - `filenameJPEG`: a string which is the filename, but coerced (if necessary) to use .jpg or
 *    .jpeg file extension
 */
const downloadImageToFile = (
  accessToken: string,
  mediaItem: GooglePhotosMediaItem
): Promise<{ imagePath: string; filenameJPEG: string }> =>
  new Promise((resolve, reject) => {
    // Download image from Google Photos using baseUrl
    // https://developers.google.com/photos/library/guides/access-media-items#image-base-urls
    axios({
      method: "get",
      url: `${mediaItem.baseUrl}=d`,
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      responseType: "stream",
    })
      .then(response => {
        let filenameJPEG = mediaItem.filename;

        if (!mediaItem.filename.toLowerCase().match(/(jpg|jpeg)/)) {
          filenameJPEG = mediaItem.filename.replace(/\.[^/.]+$/, ".jpg");
        }

        const imagePath = path.join(imageDirectory, filenameJPEG);
        const writer = fs.createWriteStream(imagePath);

        response.data.pipe(writer);

        writer.on("finish", () => resolve({ imagePath, filenameJPEG }));
        writer.on("error", e =>
          reject(
            new Error(
              `Failed to write image to path: ${imagePath}\nDue to error:\n${e}`
            )
          )
        );
      })
      .catch(e => {
        let message = "";
        if (e instanceof Error) {
          ({ message } = e);
        }
        reject(new Error(`Failed to fetch image due to error:\n${message}`));
      });
  });

/**
 * Uploads an image to the Ghost blog from a file in the local filesystem
 * @param imagePath the path to the file to upload
 * @param filenameJPEG the filename to use when appending the data to the FormData object
 * for upload
 * @param ghostAPIToken a valid Ghost API token
 * @param ghostAdminAPIURL the Ghost Admin API URL
 * @returns a Promise that resolves to a string which is the uploaded image URL
 */
const uploadImageFromFile = (
  imagePath: string,
  filenameJPEG: string,
  ghostAPIToken: string,
  ghostAdminAPIURL: string
): Promise<string> =>
  new Promise((resolve, reject) => {
    fs.promises
      .readFile(imagePath)
      .then(file => {
        const data = new FormData();
        data.append("file", file, filenameJPEG);

        // Upload image to Ghost blog
        // https://ghost.org/docs/admin-api/#uploading-an-image

        axios({
          method: "post",
          url: `${ghostAdminAPIURL}/ghost/api/admin/images/upload`,
          data,
          headers: {
            ...data.getHeaders(),
            Authorization: `Ghost ${ghostAPIToken}`,
            "Accept-Version": "v5.0",
          },
        })
          .then(result => {
            resolve(result.data.images[0].url);
          })
          .catch(e => {
            let message = "";
            if (e instanceof Error) {
              ({ message } = e);
            }
            reject(
              new Error(
                `Failed to upload file to Ghost from path ${imagePath} due to error:\n${message}`
              )
            );
          });
      })
      .catch(e => {
        let message = "";
        if (e instanceof Error) {
          ({ message } = e);
        }
        reject(
          new Error(
            `Failed to read file from path ${imagePath} due to error:\n${message}`
          )
        );
      });
  });

/**
 * @param accessToken the Google Photos access token
 * @param ghostAPIToken a valid Ghost API token
 * @param ghostAdminAPIURL the Ghost Admin API URL
 * @param mediaItem the Media Item which will be downloaded to a file, then uploaded to the
 * Ghost blog
 * @returns a Promise that resolves to a string which is the URL of the uploaded image in our Ghost
 * blog storage (which was set up with Backblaze B2 in the Ghost config)
 */
const processImage = async (
  accessToken: string,
  ghostAPIToken: string,
  ghostAdminAPIURL: string,
  mediaItem: GooglePhotosMediaItem
): Promise<string> => {
  const { imagePath, filenameJPEG } = await downloadImageToFile(
    accessToken,
    mediaItem
  );

  const ghostImageURL = await uploadImageFromFile(
    imagePath,
    filenameJPEG,
    ghostAPIToken,
    ghostAdminAPIURL
  );

  return ghostImageURL;
};

interface UploadToGhostInput {
  /**
   * the Google Photos access token
   */
  accessToken: string;
  /**
   * the Ghost Admin API key
   */
  ghostAdminAPIKey: string;
  /**
   * the Ghost Admin API URL
   */
  ghostAdminAPIURL: string;
  /**
   * the array of post details with their respective media items
   */
  detailsWithMediaItems: CreatePostDetailWithMediaItems[];
}

/**
 * @param input {@link UploadToGhostInput}
 * @returns an array of posts where each contains the result of uploading its media items to Ghost
 */
export const uploadToGhost = async ({
  accessToken,
  ghostAdminAPIKey,
  ghostAdminAPIURL,
  detailsWithMediaItems,
}: UploadToGhostInput): Promise<PostWithProcessedImages[]> => {
  const [id, secret] = ghostAdminAPIKey.split(":");

  const ghostAPIToken = jwt.sign({}, Buffer.from(secret, "hex"), {
    keyid: id,
    algorithm: "HS256",
    expiresIn: "5m",
    audience: `/admin/`,
  });

  // Create temporary /images directory to contain downloaded images

  if (!fs.existsSync(imageDirectory)) {
    fs.mkdirSync(imageDirectory);
  }

  const postsWithProcessedImages = detailsWithMediaItems.map(async details => {
    const processImagePromises = details.mediaItems.map(
      (mediaItem): Promise<ProcessedImage> => {
        if (mediaItem.mimeType !== "image/jpeg") {
          // We only want to download the data for images, not videos. If the mimeType is
          // not an image, just resolve to the mediaItem without downloading image data.
          return new Promise(resolve => {
            resolve({ mediaItem, ghostImageURL: null });
          });
        }

        return new Promise(resolve => {
          processImage(accessToken, ghostAPIToken, ghostAdminAPIURL, mediaItem)
            .then(ghostImageURL => {
              resolve({ mediaItem, ghostImageURL });
            })
            .catch(e => {
              let message = "";
              if (e instanceof Error) {
                ({ message } = e);
              }
              console.error("Could not process image due to error: ", message);
              resolve({ mediaItem, ghostImageURL: null });
            });
        });
      }
    );

    const processImagePromiseResults = Array.from(
      await Promise.allSettled(processImagePromises)
    );

    // Delete temporary /images directory
    // fs.rmSync(imageDirectory, { recursive: true, force: true });

    const processedImages = processImagePromiseResults.reduce((acc, result) => {
      if (result.status === "fulfilled") {
        acc.push(result.value);
      }

      return acc;
    }, [] as ProcessedImage[]);

    return {
      ...details,
      processedImages,
    };
  });

  const processedPostResults = await Promise.allSettled(
    postsWithProcessedImages
  );

  const posts = processedPostResults.reduce((acc, result) => {
    if (result.status === "fulfilled") {
      acc.push(result.value);
    }

    return acc;
  }, [] as PostWithProcessedImages[]);

  return posts;
};
