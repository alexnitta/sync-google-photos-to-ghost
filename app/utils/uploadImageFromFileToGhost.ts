import axios from "axios";
import type { AxiosError } from "axios";
import FormData from "form-data";
import fs from "fs";

import type { UploadImageResult, DownloadImageSuccess } from "~/types";

/**
 * Uploads an image to the Ghost blog from a file in the local filesystem
 * @param downloadImageSuccess a {@link DownloadImageSuccess} object
 * @param ghostAPIToken a valid Ghost API token
 * @param ghostAdminAPIURL the Ghost Admin API URL
 * @returns a Promise that resolves to an {@link UploadImageResult} object
 */
export const uploadImageFromFileToGhost = (
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
