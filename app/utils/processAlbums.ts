import axios from "axios";
import GhostAdminAPI from "@tryghost/admin-api";
import FormData from "form-data";
import jwt from "jsonwebtoken";
import fs from "fs";
import path from "path";

import type {
  GhostPost,
  GooglePhotosAlbum,
  GooglePhotosMediaItem,
  ModifiedGooglePhotosAlbum,
  ModifiedGooglePhotosAlbumWithMediaItems,
  ProcessedImage,
  AlbumWithProcessedImages,
} from "~/types";

const imageDirectory = path.resolve(__dirname, "../../../images");
/**
 * Docs: https://developers.google.com/photos/library/reference/rest/v1/albums/list
 * @param googleAccessToken the Google Photos access token
 * @returns All albums from Google Photos
 */
const getGooglePhotosAlbums = async (
  googleAccessToken: string
): Promise<GooglePhotosAlbum[]> => {
  try {
    const response = await axios({
      url: `https://photoslibrary.googleapis.com/v1/albums`,
      headers: {
        Authorization: `Bearer ${googleAccessToken}`,
      },
    });

    return response.data.albums;
  } catch (e) {
    throw new Error(`Failed to get Google Photos albums due to error:\n${e}`);
  }
};

/**
 * @param ghostAdminAPIKey the Ghost Admin API key
 * @param ghostAdminAPIURL the Ghost Admin API URL
 * @param {Array} googlePhotosAlbums the array of Albums in a user's Google Photos library.
 * See docs: https://developers.google.com/photos/library/reference/rest/v1/albums#Album
 * @returns a filtered version of the input array, containing only albums whose titles include the
 * string "(blog post)" (or similar), where there are no existing blog posts with a title that has
 * this string removed from it. For example, if there is a Google Photos album called "Spring 2023
 * Beach Trip (blog post)", and there is not yet a Ghost blog post with a title "Spring 2023 Beach
 * Trip", then it will be included.
 */
const getUnpostedAlbums = async (
  ghostAdminAPIKey: string,
  ghostAdminAPIURL: string,
  googlePhotosAlbums: GooglePhotosAlbum[]
): Promise<ModifiedGooglePhotosAlbum[]> => {
  const api = new GhostAdminAPI({
    key: ghostAdminAPIKey,
    url: ghostAdminAPIURL,
    version: "v5.0",
  });
  const ghostPosts: GhostPost[] = await api.posts.browse();
  const blogPostRegEx = /\([Bb]log [Pp]ost\)/;

  const unpostedAlbums = googlePhotosAlbums.reduce((acc, album) => {
    const cleanedTitle = album.title.replace(blogPostRegEx, "").trim();
    const isUnpostedAlbum =
      album.title.match(blogPostRegEx) !== null &&
      !ghostPosts.some(post => post.title === cleanedTitle);

    if (isUnpostedAlbum) {
      // Include the `cleanedTitle` so it can be used to create the Ghost blog post later
      const unpostedAlbum = { ...album, cleanedTitle };
      acc.push(unpostedAlbum);
    }

    return acc;
  }, [] as ModifiedGooglePhotosAlbum[]);

  return unpostedAlbums;
};

/**
 * @param googleAccessToken the Google Photos access token
 * @param unpostedAlbums the array of unposted albums returned by getUnpostedAlbums
 * @returns the same array, but with each album augmented with its respective array of `mediaItems`,
 * i.e. images and videos.
 */
const getAlbumsWithMediaItems = async (
  googleAccessToken: string,
  unpostedAlbums: ModifiedGooglePhotosAlbum[]
): Promise<ModifiedGooglePhotosAlbumWithMediaItems[]> => {
  const albumPromises = unpostedAlbums.map(
    (
      album: ModifiedGooglePhotosAlbum
    ): Promise<ModifiedGooglePhotosAlbumWithMediaItems> =>
      new Promise((resolve, reject) => {
        axios<{ mediaItems: GooglePhotosMediaItem[] }>({
          url: `https://photoslibrary.googleapis.com/v1/mediaItems:search`,
          headers: {
            Authorization: `Bearer ${googleAccessToken}`,
          },
          method: "post",
          data: { pageSize: 100, albumId: album.id },
        })
          .then(mediaResponse => {
            const albumWithMediaItems = {
              ...album,
              mediaItems: mediaResponse.data.mediaItems,
            };

            resolve(albumWithMediaItems);
          })
          .catch(e => {
            let message = "";
            if (e instanceof Error) {
              ({ message } = e);
            }
            reject(
              new Error(`Failed to fetch media items due to error:\n${message}`)
            );
          });
      })
  );

  const albumPromiseResults = Array.from(
    await Promise.allSettled(albumPromises)
  );

  const albumsWithMediaItems = albumPromiseResults.reduce((acc, result) => {
    if (result.status === "fulfilled") {
      acc.push(result.value);
    }

    return acc;
  }, [] as ModifiedGooglePhotosAlbumWithMediaItems[]);

  return albumsWithMediaItems;
};

/**
 * Downloads an image from a MediaItem in a Google Photos album to a file in the local filesystem
 * @param googleAccessToken the Google Photos access token
 * @param mediaItem the MediaItem from a Google Photos album
 * @returns a Promise that resolves to an object containing:
 *  - `imagePath`: a string which is the path of the downloaded image
 *  - `filenameJPEG`: a string which is the filename, but coerced (if necessary) to use .jpg or
 *    .jpeg file extension
 */
const downloadImageToFile = (
  googleAccessToken: string,
  mediaItem: GooglePhotosMediaItem
): Promise<{ imagePath: string; filenameJPEG: string }> =>
  new Promise((resolve, reject) => {
    // Download image from Google Photos using baseUrl
    // https://developers.google.com/photos/library/guides/access-media-items#image-base-urls
    axios({
      method: "get",
      url: `${mediaItem.baseUrl}=d`,
      headers: {
        Authorization: `Bearer ${googleAccessToken}`,
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
 * @param googleAccessToken the Google Photos access token
 * @param ghostAPIToken a valid Ghost API token
 * @param ghostAdminAPIURL the Ghost Admin API URL
 * @param mediaItem the Media Item which will be downloaded to a file, then uploaded to the
 * Ghost blog
 * @returns a Promise that resolves to a string which is the URL of the uploaded image in our Ghost
 * blog storage (which was set up with Backblaze B2 in the Ghost config)
 */
const processImage = async (
  googleAccessToken: string,
  ghostAPIToken: string,
  ghostAdminAPIURL: string,
  mediaItem: GooglePhotosMediaItem
): Promise<string> => {
  const { imagePath, filenameJPEG } = await downloadImageToFile(
    googleAccessToken,
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

/**
 * @param googleAccessToken the Google Photos access token
 * @param ghostAdminAPIKey the Ghost Admin API key
 * @param ghostAdminAPIURL the Ghost Admin API URL
 * @param {Array} albumsWithMediaItems the array of unposted albums with their respective media
 * items
 * @returns an array of albums where each contains the result of uploading its media items to Ghost
 */
const uploadAlbumsWithMediaItemsToGhost = async (
  googleAccessToken: string,
  ghostAdminAPIKey: string,
  ghostAdminAPIURL: string,
  albumsWithMediaItems: ModifiedGooglePhotosAlbumWithMediaItems[]
): Promise<AlbumWithProcessedImages[]> => {
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

  const albumsWithProcessedImages = albumsWithMediaItems.map(async album => {
    const processImagePromises = album.mediaItems.map(
      (mediaItem): Promise<ProcessedImage> => {
        if (mediaItem.mimeType !== "image/jpeg") {
          // We only want to download the data for images, not videos. If the mimeType is
          // not an image, just resolve to the mediaItem without downloading image data.
          return new Promise(resolve => {
            resolve({ mediaItem, ghostImageURL: null });
          });
        }

        return new Promise(resolve => {
          processImage(
            googleAccessToken,
            ghostAPIToken,
            ghostAdminAPIURL,
            mediaItem
          )
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
    fs.rmSync(imageDirectory, { recursive: true, force: true });

    const processedImages = processImagePromiseResults.reduce((acc, result) => {
      if (result.status === "fulfilled") {
        acc.push(result.value);
      }

      return acc;
    }, [] as ProcessedImage[]);

    return {
      ...album,
      processedImages,
    };
  });

  const albumResults = await Promise.allSettled(albumsWithProcessedImages);

  const resolvedAlbums = albumResults.reduce((acc, result) => {
    if (result.status === "fulfilled") {
      acc.push(result.value);
    }

    return acc;
  }, [] as AlbumWithProcessedImages[]);

  return resolvedAlbums;
};

/**
 * Automates the process of uploading images from Google Photos to Ghost.
 * - fetches all albums for a Google Photos account
 * - finds any albums with titles that match a special string, i.e. containing "(blog post)",
 *   which have not yet been created as Ghost posts
 * - for each of these albums
 *  - for each media item in the album
 *    - downloads the media item if it is a JPEG image
 *    - uploads the media item to Ghost blog storage
 * @returns an array of objects with details of each album. See ./sampleProcessedAlbums.json for
 * an example.
 */
export const processAlbums = async (
  googleAccessToken: string,
  ghostAdminAPIKey: string,
  ghostAdminAPIURL: string
): Promise<AlbumWithProcessedImages[]> => {
  const googlePhotosAlbums = await getGooglePhotosAlbums(googleAccessToken);

  const unpostedAlbums = await getUnpostedAlbums(
    ghostAdminAPIKey,
    ghostAdminAPIURL,
    googlePhotosAlbums
  );

  const albumsWithMediaItems = await getAlbumsWithMediaItems(
    googleAccessToken,
    unpostedAlbums
  );

  return uploadAlbumsWithMediaItemsToGhost(
    googleAccessToken,
    ghostAdminAPIKey,
    ghostAdminAPIURL,
    albumsWithMediaItems
  );
};
