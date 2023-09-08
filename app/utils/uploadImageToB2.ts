import { Upload } from "@aws-sdk/lib-storage";
import { S3Client } from "@aws-sdk/client-s3";

import type {
  PutObjectCommandInput,
  Tag,
  S3ClientConfig,
} from "@aws-sdk/client-s3";
import type { Progress } from "@aws-sdk/lib-storage";

interface UploadImageToB2Input {
  /**
   * The image to upload
   */
  body: PutObjectCommandInput["Body"];
  /**
   * The Backblaze B2 bucket to upload the image to
   */
  bucket: string;
  /**
   * S3 client configuration containing bucket region and access credentials
   */
  clientConfig: S3ClientConfig;
  /**
   * The key to use for the image in the bucket (i.e. the filename)
   */
  key: string;
  /**
   * Whether to leave parts in the bucket when an error occurs during a multipart upload.
   * @defaultValue false
   */
  leavePartsOnError?: boolean;
  /**
   * Optional callback to track the progress of the upload.
   * @param progress the current {@link Progress} when it is updated
   * @returns undefined
   */
  onProgress?: (progress: Progress) => void;
  /**
   * The size of each part to upload, in bytes. Defaults to 5MB.
   * @defaultValue 1024 * 1024 * 5 = 5,242,880 bytes or 5MB
   */
  partSize?: number;
  /**
   * The number of concurrent uploads to perform.
   * @defaultValue 4
   */
  queueSize?: number;
  /**
   * Optional tags to apply to the uploaded image.
   */
  tags?: Tag[];
}

/**
 * Upload an image to Backblaze B2 using the AWS SDK v3. The image will be split into parts and
 * the parts will be uploaded in parallel.
 * @param param {@link UploadImageToB2Input}
 * @returns a Promise that resolves to the result of the upload
 */
export const uploadImageToB2 = async ({
  body,
  bucket,
  clientConfig,
  key,
  leavePartsOnError = false,
  onProgress,
  partSize,
  queueSize,
  tags,
}: UploadImageToB2Input): ReturnType<Upload["done"]> => {
  const parallelUploads3 = new Upload({
    client: new S3Client(clientConfig),
    params: { Bucket: bucket, Key: key, Body: body },
    tags,
    queueSize,
    partSize,
    leavePartsOnError,
  });

  if (onProgress) {
    parallelUploads3.on("httpUploadProgress", onProgress);
  }

  const result = await parallelUploads3.done();

  return result;
};
