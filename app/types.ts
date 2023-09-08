import type { GoogleProfile } from "remix-auth-google";

export interface User {
  profile: GoogleProfile;
  accessToken: string;
  refreshToken: string;
}

export interface GooglePhotosAlbum {
  id: string;
  title: string;
}

export interface GooglePhotosMediaItem {
  id: string;
  baseUrl: string;
  filename: string;
  mimeType: string;
  description?: string;
}

interface ProcessImageDetails {
  /**
   * The Google Photos MediaItem ID to process
   */
  id: string;
  /**
   * The path of the downloaded image
   */
  imagePath: string;
  /**
   * The filename, edited (if necessary) to use .jpg or .jpeg file extension
   */
  filenameJPEG: string;
}

export interface DownloadImageSuccess extends ProcessImageDetails {
  state: "success";
}

export interface DownloadImageError extends ProcessImageDetails {
  state: "error";
  error: string;
}

export type DownloadImageResult = DownloadImageSuccess | DownloadImageError;

export interface UploadImageSuccess extends DownloadImageSuccess {
  httpStatus?: number;
  /**
   * The URL of the uploaded image in the Ghost blog media storage
   */
  ghostImageURL: string;
}

export type UploadImageError = Omit<DownloadImageSuccess, "state"> & {
  state: "error";
  error: string;
  httpStatus?: number;
  failedTask: "readFile" | "uploadImage" | "parseResponse";
};

export type UploadImageResult =
  | UploadImageSuccess
  | DownloadImageError
  | UploadImageError;

export interface ProcessedImage {
  /**
   * The Google Photos MediaItem that was processed.
   */
  mediaItem: GooglePhotosMediaItem;
  /**
   * The result of downloading the image.
   */
  downloadImageResult: DownloadImageResult | null;
  /**
   * The result of uploading the image. If the image was not downloaded, this will be null.
   */
  uploadImageResult: UploadImageResult | null;
}

export interface Post {
  slug: string;
  id: string;
  url: string;
  title: string;
}

export interface PostConfig {
  title: string;
  html?: string;
  mobiledoc?: string;
}

export interface AddPostOptions {
  source?: "html";
}

export type AddPost = (
  postConfig: PostConfig,
  addPostOptions: AddPostOptions
) => Promise<Post>;

export interface GhostAdminAPIPosts {
  add: AddPost;
}

export interface GhostAdminAPIMethods {
  posts: GhostAdminAPIPosts;
}

export type CreatePostDetail = {
  postTitle: string;
  albumId: string;
};

export type PartialCreatePostDetail = Partial<CreatePostDetail>;

export interface CreatePostDetailWithMediaItems extends CreatePostDetail {
  mediaItems: GooglePhotosMediaItem[];
}

export interface PostWithProcessedImages extends CreatePostDetail {
  processedImages: ProcessedImage[];
}

export interface PostDetails
  extends Omit<PostWithProcessedImages, "postTitle"> {
  title: string;
  elements: string[];
}

export interface CreatedPostDetails extends PostDetails {
  state: "success";
  albumId: string;
}

export type AlbumPostSuccess = Post & CreatedPostDetails;

export type AlbumPostError = PostDetails & {
  state: "error";
  error: string;
};

export type AlbumPostResult = AlbumPostSuccess | AlbumPostError;

export type AlbumCSVRow = {
  albumId?: string;
  title?: string;
  url?: string;
  state: "success" | "error";
  error?: string;
};

export interface ImageCSVRow extends GooglePhotosMediaItem {
  albumId: string;
  downloadState: "success" | "error" | "unknown";
  downloadError?: string;
  uploadState: "success" | "error" | "unknown";
  uploadError?: string;
  ghostImageURL?: string;
}

export type AlbumPostCSVRow = AlbumCSVRow & { images: ImageCSVRow[] };

export interface BackblazeB2Config {
  /**
   * The name of the Backblaze B2 bucket to upload images to
   */
  bucket: string;
  /**
   * The region of the Backblaze B2 bucket
   */
  bucketRegion: string;
  /**
   * An access key ID for a Backblaze B2 application key
   */
  accessKeyID: string;
  /**
   * Secret access key for a Backblaze B2 application key
   */
  secretAccessKey: string;
}
