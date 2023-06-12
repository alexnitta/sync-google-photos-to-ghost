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

export interface ModifiedGooglePhotosAlbum extends GooglePhotosAlbum {
  cleanedTitle: string;
}

export interface GooglePhotosMediaItem {
  id: string;
  baseUrl: string;
  filename: string;
  mimeType: string;
  description?: string;
}

export interface ModifiedGooglePhotosAlbumWithMediaItems
  extends GooglePhotosAlbum {
  cleanedTitle: string;
  mediaItems: GooglePhotosMediaItem[];
}

export interface GhostPost {
  title: string;
}

export interface ProcessedImage {
  mediaItem: GooglePhotosMediaItem;
  ghostImageURL: string | null;
}

export interface AlbumWithProcessedImages extends ModifiedGooglePhotosAlbum {
  processedImages: ProcessedImage[];
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

export interface PostDetails {
  cleanedTitle: string;
  elements: string[];
}