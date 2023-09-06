import axios from "axios";
import type { AxiosError } from "axios";
import FormData from "form-data";
import jwt from "jsonwebtoken";
import fs from "fs";
import path from "path";
import PQueue from "p-queue";

import type {
  GooglePhotosMediaItem,
  CreatePostDetailWithMediaItems,
  ProcessedImage,
  PostWithProcessedImages,
  DownloadImageResult,
  UploadImageResult,
  DownloadImageSuccess,
} from "~/types";

const imageDirectory = path.resolve(__dirname, "../_tmp_images");

/** If this app were serving more than one user, we would want
 * to set up the queues on a per-user basis, but we don't need to do that yet.
 */

/**
 * We only process one album at a time.
 */
const albumQueue = new PQueue({ concurrency: 1 });
/**
 * Within the single album that is being processed, we process up to 5 images at a time, but we
 * throttle the start of each image processing on a 20ms interval. If there is some rate limiting
 * happening in the Ghost storage backend, this should help avoid hitting the rate limit.
 */
const imageQueue = new PQueue({
  concurrency: 5,
  interval: 20,
  intervalCap: 1,
});

interface DownloadImageToFileInput {
  /**
   * The Google Photos access token
   */
  accessToken: string;
  /**
   * The MediaItem from a Google Photos album
   */
  mediaItem: GooglePhotosMediaItem;
  /**
   * The max height to use when downloading the image from Google Photos
   */
  imageMaxHeight: number;
  /**
   * The max width to use when downloading the image from Google Photos
   */
  imageMaxWidth: number;
}

/**
 * Downloads an image from a MediaItem in a Google Photos album to a file in the local filesystem
 * @param accessToken
 * @param mediaItem the MediaItem from a Google Photos album
 * @returns a Promise that resolves to a {@link DownloadImageResult}
 */
const downloadImageToFile = ({
  accessToken,
  imageMaxHeight,
  imageMaxWidth,
  mediaItem,
}: DownloadImageToFileInput): Promise<DownloadImageResult> =>
  new Promise(resolve => {
    let filenameJPEG = mediaItem.filename;

    if (!mediaItem.filename.toLowerCase().match(/(jpg|jpeg)/)) {
      filenameJPEG = mediaItem.filename.replace(/\.[^/.]+$/, ".jpg");
    }

    const imagePath = path.join(imageDirectory, filenameJPEG);
    const { id } = mediaItem;

    // Download image from Google Photos using baseUrl
    // https://developers.google.com/photos/library/guides/access-media-items#image-base-urls
    axios({
      method: "get",
      url: `${mediaItem.baseUrl}=w${imageMaxWidth}-h${imageMaxHeight}`,
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      responseType: "stream",
    })
      .then(response => {
        const writer = fs.createWriteStream(imagePath);

        response.data.pipe(writer);

        writer.on("finish", () =>
          resolve({
            id,
            imagePath,
            filenameJPEG,
            state: "success",
          })
        );
        writer.on("error", e =>
          resolve({
            id,
            imagePath,
            filenameJPEG,
            error: e.message,
            state: "error",
          })
        );
      })
      .catch(e => {
        let message = "";
        if (e instanceof Error) {
          ({ message } = e);
        }
        resolve({
          id,
          imagePath,
          filenameJPEG,
          error: message,
          state: "error",
        });
      });
  });

/**
 * Uploads an image to the Ghost blog from a file in the local filesystem
 * @param downloadImageSuccess a {@link DownloadImageSuccess} object
 * @param ghostAPIToken a valid Ghost API token
 * @param ghostAdminAPIURL the Ghost Admin API URL
 * @returns a Promise that resolves to an {@link UploadImageResult} object
 */
const uploadImageFromFile = (
  downloadImageSuccess: DownloadImageSuccess,
  ghostAPIToken: string,
  ghostAdminAPIURL: string
): Promise<UploadImageResult> =>
  new Promise(resolve => {
    const { imagePath, filenameJPEG } = downloadImageSuccess;

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
            const ghostImageURL = result?.data?.images?.[0]?.url ?? null;

            if (typeof ghostImageURL !== "string") {
              resolve({
                ...downloadImageSuccess,
                state: "error",
                error: "Could not parse Ghost image URL from response",
                httpStatus: result.status,
                failedTask: "parseResponse",
              });
            }

            resolve({
              ...downloadImageSuccess,
              httpStatus: result.status,
              ghostImageURL,
            });
          })
          .catch((e: AxiosError) => {
            const { message, status } = e;

            resolve({
              ...downloadImageSuccess,
              state: "error",
              error: message,
              failedTask: "uploadImage",
              httpStatus: status,
            });
          });
      })
      .catch(e => {
        let message = "Unknown error when reading image file";
        if (e instanceof Error) {
          ({ message } = e);
        }
        resolve({
          ...downloadImageSuccess,
          state: "error",
          error: message,
          failedTask: "readFile",
        });
      });
  });

interface UploadToGhostInput {
  /**
   * The Google Photos access token
   */
  accessToken: string;
  /**
   * The Ghost Admin API key
   */
  ghostAdminAPIKey: string;
  /**
   * The Ghost Admin API URL
   */
  ghostAdminAPIURL: string;
  /**
   * The array of post details with their respective media items
   */
  detailsWithMediaItems: CreatePostDetailWithMediaItems[];
  /**
   * The max height to use when downloading the image from Google Photos
   */
  imageMaxHeight: number;
  /**
   * The max width to use when downloading the image from Google Photos
   */
  imageMaxWidth: number;
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
  imageMaxHeight,
  imageMaxWidth,
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

  const postsWithProcessedImages = detailsWithMediaItems.map(details =>
    albumQueue.add<PostWithProcessedImages>(async () => {
      const processImagePromises = details.mediaItems.map(
        (mediaItem): Promise<ProcessedImage | void> => {
          if (mediaItem.mimeType !== "image/jpeg") {
            // We only want to process the data for images, not videos.
            return new Promise(resolve => {
              resolve({
                mediaItem,
                downloadImageResult: null,
                uploadImageResult: null,
              });
            });
          }

          return imageQueue.add<ProcessedImage>(
            () =>
              new Promise<ProcessedImage>(resolve => {
                downloadImageToFile({
                  accessToken,
                  mediaItem,
                  imageMaxHeight,
                  imageMaxWidth,
                }).then(downloadImageResult => {
                  if (downloadImageResult.state === "error") {
                    resolve({
                      mediaItem,
                      downloadImageResult,
                      uploadImageResult: null,
                    });
                  } else {
                    uploadImageFromFile(
                      downloadImageResult,
                      ghostAPIToken,
                      ghostAdminAPIURL
                    ).then(uploadImageResult => {
                      resolve({
                        mediaItem,
                        downloadImageResult,
                        uploadImageResult,
                      });
                    });
                  }
                });
              })
          );
        }
      );

      const processedImages = Array.from(
        await Promise.all(processImagePromises)
      ).filter(value => value !== undefined) as ProcessedImage[];

      // Delete temporary /images directory
      fs.rmSync(imageDirectory, { recursive: true, force: true });

      return {
        ...details,
        processedImages,
      };
    })
  );

  return Array.from(await Promise.all(postsWithProcessedImages)).filter(
    value => value !== undefined
  ) as PostWithProcessedImages[];
};
