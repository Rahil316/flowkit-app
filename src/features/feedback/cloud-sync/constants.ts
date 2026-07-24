// JSONBin cloud-sync — archived, gated feature. See ./index.ts for the deletion recipe.
//
// NOTE: keep these string values in sync with the original definitions that used to
// live in shared/constants/storageKeys.ts — do not change them. Existing users may
// already have data saved under these exact localStorage keys; renaming the string
// values (not just the constant names) would orphan that data.
export const LS_CLOUD_EXPORT_ENABLED = 'flowkit-cloud-export-enabled'
export const LS_JSONBIN_KEY = 'flowkit-jsonbin-key'
export const LS_JSONBIN_READ_KEY = 'flowkit-jsonbin-read-key'

// Set providedKey to pre-fill the cloud key for all users of this build.
// Leave as "" to require the user to enter their own key.
// Set collectionName to route all pushes into a named JSONBin collection.
// Leave as "" to push bins without a collection.
export const JSONBIN_CONFIG = {
  providedKey: '',
  collectionName: 'Page Feedback',
} as const
