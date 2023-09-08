import fs from "fs";

import { uploadImageToB2 } from ".";

import type {
  UploadImageResult,
  DownloadImageSuccess,
  BackblazeB2Config,
} from "~/types";

/**
 * Uploads an image to the Backblaze B2 bucket from a file in the local filesystem
 * @param downloadImageSuccess a {@link DownloadImageSuccess} object
 * @param backblazeB2Config a {@link BackblazeB2Config} object
 * @returns a Promise that resolves to an {@link UploadImageResult} object
 */
export const uploadImageFromFileToB2 = (
  downloadImageSuccess: DownloadImageSuccess,
  backblazeB2Config: BackblazeB2Config
): Promise<UploadImageResult> =>
  new Promise(resolve => {
    const { imagePath, filenameJPEG } = downloadImageSuccess;
    const { bucket, ...clientConfig } = backblazeB2Config;

    fs.promises
      .readFile(imagePath)
      .then(file => {
        uploadImageToB2({
          body: file,
          bucket,
          clientConfig,
          // TODO: use an appropriate key
          key: `test_upload/${filenameJPEG}`,
        }).then(result => {
          console.log(
            "uploadImageToB2 result: ",
            JSON.stringify(result, null, 4)
          );

          if (!("Location" in result)) {
            resolve({
              ...downloadImageSuccess,
              state: "error",
              error: "Could not read Location in result of B2 upload",
              failedTask: "parseResponse",
            });
          } else {
            const ghostImageURL = result.Location;

            if (typeof ghostImageURL !== "string") {
              resolve({
                ...downloadImageSuccess,
                state: "error",
                error: "Location is undefined in result of B2 upload",
                failedTask: "parseResponse",
              });
            } else {
              resolve({
                ...downloadImageSuccess,
                ghostImageURL,
              });
            }
          }
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
