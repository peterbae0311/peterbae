/**
 * image_slideshow의 사진/음악 파일을 OCI Object Storage에 저장.
 * 브라우저는 이 서버를 거치지 않고 파일을 직접 OCI로 PUT해야 하므로(대역폭 절약),
 * 여기서는 짧은 시간만 유효한 PAR(Pre-Authenticated Request — S3 presigned URL과 동일한 개념)을
 * 발급해서 브라우저에 돌려주는 역할만 한다.
 *
 * 전제: 버킷은 "공개 읽기(public object read)"로 만들어져 있어야 함 — 그래야 업로드 후
 * PAR 없이도 안정적인 공개 URL로 사진을 바로 서빙할 수 있다(기존 Supabase Storage의
 * getPublicUrl()과 동일한 동작). 쓰기(업로드/삭제)만 인증이 필요하므로 PAR로 처리.
 */
import 'server-only';
import * as common from 'oci-common';
import * as objectstorage from 'oci-objectstorage';
import { imageSlideshowEnv } from './env';

function getClient(): objectstorage.ObjectStorageClient {
  const provider = new common.SimpleAuthenticationDetailsProvider(
    imageSlideshowEnv.ociTenancy,
    imageSlideshowEnv.ociUser,
    imageSlideshowEnv.ociFingerprint,
    imageSlideshowEnv.ociPrivateKey,
    null,
    common.Region.fromRegionId(imageSlideshowEnv.ociRegion)
  );
  return new objectstorage.ObjectStorageClient({ authenticationDetailsProvider: provider });
}

function objectStorageHost(): string {
  return `https://objectstorage.${imageSlideshowEnv.ociRegion}.oraclecloud.com`;
}

export function publicUrlFor(objectName: string): string {
  return `${objectStorageHost()}/n/${imageSlideshowEnv.ociNamespace}/b/${imageSlideshowEnv.ociBucket}/o/${encodeURIComponent(objectName)}`;
}

/** 지정한 objectName에 대해 짧게 유효한 업로드 전용 PAR을 발급한다. */
export async function createUploadPar(objectName: string, expiresInMinutes = 15) {
  const client = getClient();
  const timeExpires = new Date(Date.now() + expiresInMinutes * 60_000);

  const response = await client.createPreauthenticatedRequest({
    namespaceName: imageSlideshowEnv.ociNamespace,
    bucketName: imageSlideshowEnv.ociBucket,
    createPreauthenticatedRequestDetails: {
      name: `upload-${Date.now()}-${objectName}`,
      objectName,
      accessType: objectstorage.models.CreatePreauthenticatedRequestDetails.AccessType.ObjectWrite,
      timeExpires,
    },
  });

  return {
    uploadUrl: `${objectStorageHost()}${response.preauthenticatedRequest.accessUri}`,
    publicUrl: publicUrlFor(objectName),
  };
}

/** 앨범/사진 삭제 시 실제 오브젝트도 정리 — 개별 실패는 무시하는 best-effort. */
export async function deleteObjects(objectNames: string[]): Promise<void> {
  if (objectNames.length === 0) return;
  const client = getClient();
  await Promise.all(
    objectNames.map((objectName) =>
      client
        .deleteObject({
          namespaceName: imageSlideshowEnv.ociNamespace,
          bucketName: imageSlideshowEnv.ociBucket,
          objectName,
        })
        .catch((err) => console.warn('[image-slideshow] OCI object delete failed:', objectName, err?.message))
    )
  );
}
