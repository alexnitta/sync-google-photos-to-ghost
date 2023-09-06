import type { AlbumPostResult, AlbumPostCSVRow, ImageCSVRow } from "~/types";

/**
 * Maps an {@link AlbumPostResult} to an {@link AlbumPostCSVRow}
 * @param albumPostResult
 * @returns {@link AlbumPostCSVRow}
 */
export const albumPostsToCSVData = (
  albumPostResult: AlbumPostResult
): AlbumPostCSVRow => {
  const { albumId, title, processedImages, state } = albumPostResult;
  const url = state === "success" ? albumPostResult.url : undefined;

  const images = processedImages.map((processedImage): ImageCSVRow => {
    const {
      mediaItem: { id, baseUrl, filename, mimeType, description },
      downloadImageResult,
      uploadImageResult,
    } = processedImage;
    const uploadState = uploadImageResult?.state ?? "unknown";
    const uploadError =
      uploadImageResult?.state === "error"
        ? uploadImageResult?.error
        : undefined;
    const downloadState = downloadImageResult?.state ?? "unknown";
    const downloadError =
      downloadImageResult?.state === "error"
        ? downloadImageResult?.error
        : undefined;
    const ghostImageURL =
      uploadImageResult?.state === "success"
        ? uploadImageResult?.ghostImageURL
        : undefined;

    return {
      id,
      albumId,
      filename,
      description,
      mimeType,
      baseUrl,
      downloadState,
      downloadError,
      uploadState,
      uploadError,
      ghostImageURL,
    };
  });

  return {
    albumId,
    title,
    url,
    images,
    state,
  };
};
