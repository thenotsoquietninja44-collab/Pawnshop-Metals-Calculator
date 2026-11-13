Automatic updates with verified backups.

- Checks GitHub on startup and every four hours; downloads updates automatically.
- Before an in-app update installs, copies the complete installed app, saved coins, premiums, chosen list and settings into a dated backup and verifies every file with SHA-256. Backup failure blocks installation.
- Records unsaved form values separately for recovery.
- Adds Updates & backups with Back up now, Open backup folder and Restore shop data. Restoring saved data first backs up your current data. Program files and unsaved drafts remain available in the backup folder for manual recovery.
- Disables installation on ordinary app exit so updates cannot bypass the backup step.
- Includes backup failure tests, renderer checks and a full packaged Windows backup check. CI uses a simulated installation callback; a real upgrade between releases is not exercised by CI.

First upgrade from v0.4.0 or earlier: export your shop setup once before installing this release. The old app cannot run the new backup code. Automatic pre-update backups apply to subsequent in-app updates from v0.5.0 onward. Launching an installer directly does not run the app backup step.

Backups are local and not automatically deleted. Keep each whole backup folder together. Verify historical manual spot prices before reusing them.
