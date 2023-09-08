import axios from "axios";
import fs from "fs";
import path from "path";

import { imageDirectory } from "./constants";
import type { GooglePhotosMediaItem, DownloadImageResult } from "~/types";

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
 * @param input {@link DownloadImageToFileInput}
 * @returns a Promise that resolves to a {@link DownloadImageResult}
 */
export const downloadImageToFile = ({
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
