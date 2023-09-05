import type { AlbumPostResult, AlbumPostCSVRow } from "~/types";

/**
 * Maps an {@link AlbumPostResult} to an {@link AlbumPostCSVRow}
 * @param albumPostResult
 * @returns {@link AlbumPostCSVRow}
 */
export const albumPostsToCSVData = (
  albumPostResult: AlbumPostResult
): AlbumPostCSVRow => {
  const { albumId, title, url, processedImages } = albumPostResult;

  const images = processedImages.map(processedImage => {
    const { mediaItem, ghostImageURL } = processedImage;
    const { id, baseUrl, filename, mimeType, description } = mediaItem;

    return {
      id,
      albumId,
      filename,
      description,
      mimeType,
      baseUrl,
      ghostImageURL,
    };
  });

  return {
    albumId,
    title,
    url,
    images,
  };
};
