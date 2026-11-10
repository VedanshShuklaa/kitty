# Kitty Android distribution

Checked against Expo and Google Play documentation on October 6, 2026.

## The APK filename

`app.config.ts` already sets the installed app name to **Kitty**, with Android
package `xyz.kitty.app`. The package's `name: "app"` in `package.json` is the
workspace name; changing it does not rename the Android app.

The website's `/download` redirects to Expo. The current artifact's final HTTP
response sets `Content-Disposition: attachment; filename="application-<build-id>.apk"`.
That response determines the downloaded filename. Renaming the APK does not
change its contents, signing certificate, or installed app label.

A copy of the currently linked build is saved locally as `output/releases/Kitty.apk`
(ignored by Git). For a permanent website fix:

1. Upload that file as **Kitty.apk** to a public release or file host you control.
2. Configure that host to return `Content-Disposition: attachment; filename="Kitty.apk"`
   (or verify that it already does).
3. Change the `/download` destination in `site/vercel.json` to the permanent asset URL.
4. Deploy the site, then download from `/download` on an Android phone and check the filename.

Putting a `download="Kitty.apk"` attribute on a link that redirects to Expo is
not a reliable fix across origins. The final file host must provide the desired
filename. The current Expo artifact's response reports an expiry of **October 20,
2026**, so replace it before then. No permanent host or website deployment has
been changed by this preparation.

If the name under the installed launcher icon is also wrong, build and install a
new preview from this checkout; a filename change alone cannot fix an old native
app label:

```sh
cd app
npx eas-cli@latest build --platform android --profile preview
```

## Build for Google Play

Google Play needs an **Android App Bundle (.aab)** for a new app. The preview APK
is for direct installation. `eas.json` now explicitly builds an app bundle for
`production`, manages version codes remotely, increments them on each production
build, and submits to the **internal** track as a **draft**.

From the repository root:

```sh
cd app
npx eas-cli@latest login
npx eas-cli@latest build --platform android --profile production
```

Keep using the existing EAS project and Android signing credentials. If this
package already has releases in Play Console, initialize EAS's remote Android
version code from the highest uploaded version before building:

```sh
npx eas-cli@latest build:version:set --platform android --profile production
```

Use the production build's `.aab` download for Play Console. Google's current
new-app requirement is **Android 16 / API 36** (effective August 31, 2026). Kitty
uses Expo SDK 57, whose documented Android target is API 36; confirm the uploaded
bundle's target in Play Console. A profile named `production` does not switch
Kitty from Monad testnet to mainnet: it still uses `deployments/10143.json` and
test dollars.

Sources: [Expo APK builds](https://docs.expo.dev/build-reference/apk/),
[version management](https://docs.expo.dev/build-reference/app-versions/),
[Expo SDK targets](https://docs.expo.dev/versions/latest/),
[Google target API requirements](https://support.google.com/googleplay/android-developer/answer/11926878).

## Set up Play Console and upload

1. Register and verify a [Google Play developer account](https://support.google.com/googleplay/android-developer/answer/6112435)
   (one-time US$25 fee). Google says financial services, including cryptocurrency
   software wallets, should use an **organization** account, which normally needs
   a D-U-N-S number. For Kitty's financial functionality, plan around that account
   type; for a strictly testnet demo, confirm classification with Play support.
   See [account types](https://support.google.com/googleplay/android-developer/answer/13634885).
2. Create the app with store name **Kitty**. Use the existing package
   **xyz.kitty.app**; package names are permanent once registered with an uploaded
   artifact. Enroll in Play App Signing.
3. Upload the production `.aab` to **Internal testing**, save the release, and
   complete the required setup tasks. This can be done manually; see
   [Expo's manual upload guide](https://docs.expo.dev/submit/android-manual/).
4. Alternatively, create a Google service account with the required Play Console
   permissions and upload its key to EAS credentials. Then run the following
   with the production build ID printed by EAS Build:

   ```sh
   npx eas-cli@latest submit --platform android --profile production --id YOUR_PRODUCTION_BUILD_ID
   ```

   This prepares an internal draft, not a public release. Finish it in Play
   Console. See [EAS Submit](https://docs.expo.dev/submit/android/). Keep service
   account keys out of the repository.

## Complete the listing and review requirements

- Supply a short/full description, a 512×512 store icon, 1024×500 feature graphic,
  phone screenshots, support email, target audience, content rating, and ads
  declaration. Describe this build accurately as a testnet demo with test funds.
- Publish a privacy policy and complete Data safety based on actual app, SDK,
  backend, and blockchain data handling. There is currently no privacy-policy
  page in `site/public`.
- Review account deletion requirements for Kitty's passkey/profile creation.
  Implement in-app deletion/request access and a public deletion-request URL
  where required; explain retained public blockchain records accurately.
- Complete Financial features and applicable blockchain declarations accurately;
  do not assume testnet or non-custodial design removes all declarations.
- Provide review instructions that let Google's reviewers create a passkey, get
  test funds, and exercise the circles and payment features without needing you
  online.

Sources: [app setup](https://support.google.com/googleplay/android-developer/answer/9859152),
[listing graphics](https://support.google.com/googleplay/android-developer/answer/9866151),
[User Data](https://support.google.com/googleplay/android-developer/answer/10144311),
[account deletion](https://support.google.com/googleplay/android-developer/answer/13327111),
[Financial features](https://support.google.com/googleplay/android-developer/answer/13849271),
[blockchain content](https://support.google.com/googleplay/android-developer/answer/13607354).

## Test the Play-installed app before releasing

Play App Signing may use a different certificate from the direct-install APK.
Copy the **app signing certificate SHA-256**, not just the upload certificate,
from Play Console into `site/public/.well-known/assetlinks.json`, alongside the
existing fingerprint. Keep both `common.get_login_creds` and
`common.handle_all_urls`, and deploy the site. Verify passkey creation/sign-in
and `/j/`, `/p/`, `/s/` links using the app installed **through Google Play**.
See [Android App Links](https://docs.expo.dev/linking/android-app-links/).

Run the native checks in `qa/README.md`, plus complete two-phone circle and send
flows. Confirm the live sponsor, indexer, profile service, and keeper work with
the release build.

If using a **personal account created after November 13, 2023**, production
access requires a **closed test with at least 12 testers opted in continuously
for 14 days**, followed by a production-access application. Internal testing
alone does not satisfy that requirement. It is account-type dependent; see
[Google's testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465).

After meeting the applicable gates, promote the tested bundle to Production,
select countries, submit it for review, and roll out after approval. The local
configuration and APK copy are preparation only: no AAB build, store upload,
listing, or public release has been performed.
