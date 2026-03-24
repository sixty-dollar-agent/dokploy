import { execSync, spawnSync } from "node:child_process";
import path from "node:path";

export type RcloneDestinationType =
	| "s3"
	| "ftp"
	| "sftp"
	| "google-drive"
	| "onedrive"
	| "dropbox"
	| "b2"
	| "azure";

export interface RcloneS3Config {
	type: "s3";
	accessKeyId: string;
	secretAccessKey: string;
	region: string;
	bucket: string;
	endpoint?: string;
}

export interface RcloneFtpConfig {
	type: "ftp";
	host: string;
	port?: number;
	user: string;
	password: string;
	remotePath: string;
}

export interface RcloneSftpConfig {
	type: "sftp";
	host: string;
	port?: number;
	user: string;
	password?: string;
	privateKey?: string;
	remotePath: string;
}

export interface RcloneGoogleDriveConfig {
	type: "google-drive";
	clientId: string;
	clientSecret: string;
	token: string;
	rootFolderId?: string;
	remotePath: string;
}

export interface RcloneOnedriveConfig {
	type: "onedrive";
	clientId: string;
	clientSecret: string;
	token: string;
	driveId?: string;
	remotePath: string;
}

export interface RcloneDropboxConfig {
	type: "dropbox";
	clientId: string;
	clientSecret: string;
	token: string;
	remotePath: string;
}

export interface RcloneB2Config {
	type: "b2";
	accountId: string;
	accountKey: string;
	bucket: string;
	remotePath?: string;
}

export interface RcloneAzureConfig {
	type: "azure";
	account: string;
	key: string;
	container: string;
	remotePath?: string;
}

export type RcloneConfig =
	| RcloneS3Config
	| RcloneFtpConfig
	| RcloneSftpConfig
	| RcloneGoogleDriveConfig
	| RcloneOnedriveConfig
	| RcloneDropboxConfig
	| RcloneB2Config
	| RcloneAzureConfig;

/**
 * Build rclone config file content and remote path for a given destination config.
 */
export function buildRcloneConfig(config: RcloneConfig): {
	configContent: string;
	remotePath: string;
} {
	const remoteName = "dokploy-remote";

	switch (config.type) {
		case "s3": {
			const configContent = [
				`[${remoteName}]`,
				"type = s3",
				"provider = AWS",
				`access_key_id = ${config.accessKeyId}`,
				`secret_access_key = ${config.secretAccessKey}`,
				`region = ${config.region}`,
				config.endpoint ? `endpoint = ${config.endpoint}` : "",
			]
				.filter(Boolean)
				.join("\n");
			return {
				configContent,
				remotePath: `${remoteName}:${config.bucket}`,
			};
		}

		case "ftp": {
			const configContent = [
				`[${remoteName}]`,
				"type = ftp",
				`host = ${config.host}`,
				`port = ${config.port ?? 21}`,
				`user = ${config.user}`,
				`pass = ${config.password}`,
			].join("\n");
			return {
				configContent,
				remotePath: `${remoteName}:${config.remotePath}`,
			};
		}

		case "sftp": {
			const lines = [
				`[${remoteName}]`,
				"type = sftp",
				`host = ${config.host}`,
				`port = ${config.port ?? 22}`,
				`user = ${config.user}`,
			];
			if (config.password) {
				lines.push(`pass = ${config.password}`);
			}
			if (config.privateKey) {
				lines.push(`key_pem = ${config.privateKey}`);
			}
			return {
				configContent: lines.join("\n"),
				remotePath: `${remoteName}:${config.remotePath}`,
			};
		}

		case "google-drive": {
			const configContent = [
				`[${remoteName}]`,
				"type = drive",
				`client_id = ${config.clientId}`,
				`client_secret = ${config.clientSecret}`,
				`token = ${config.token}`,
				config.rootFolderId
					? `root_folder_id = ${config.rootFolderId}`
					: "",
			]
				.filter(Boolean)
				.join("\n");
			return {
				configContent,
				remotePath: `${remoteName}:${config.remotePath}`,
			};
		}

		case "onedrive": {
			const configContent = [
				`[${remoteName}]`,
				"type = onedrive",
				`client_id = ${config.clientId}`,
				`client_secret = ${config.clientSecret}`,
				`token = ${config.token}`,
				config.driveId ? `drive_id = ${config.driveId}` : "",
			]
				.filter(Boolean)
				.join("\n");
			return {
				configContent,
				remotePath: `${remoteName}:${config.remotePath}`,
			};
		}

		case "dropbox": {
			const configContent = [
				`[${remoteName}]`,
				"type = dropbox",
				`client_id = ${config.clientId}`,
				`client_secret = ${config.clientSecret}`,
				`token = ${config.token}`,
			].join("\n");
			return {
				configContent,
				remotePath: `${remoteName}:${config.remotePath}`,
			};
		}

		case "b2": {
			const configContent = [
				`[${remoteName}]`,
				"type = b2",
				`account = ${config.accountId}`,
				`key = ${config.accountKey}`,
			].join("\n");
			return {
				configContent,
				remotePath: `${remoteName}:${config.bucket}${config.remotePath ? `/${config.remotePath}` : ""}`,
			};
		}

		case "azure": {
			const configContent = [
				`[${remoteName}]`,
				"type = azureblob",
				`account = ${config.account}`,
				`key = ${config.key}`,
			].join("\n");
			return {
				configContent,
				remotePath: `${remoteName}:${config.container}${config.remotePath ? `/${config.remotePath}` : ""}`,
			};
		}

		default: {
			throw new Error(`Unsupported rclone destination type`);
		}
	}
}

/**
 * Upload a local file to a remote destination using rclone.
 *
 * @param localFilePath - Absolute path to the local file to upload.
 * @param config - Rclone destination configuration.
 * @param remoteFileName - Optional filename to use on the remote. Defaults to the local filename.
 */
export async function uploadFileWithRclone(
	localFilePath: string,
	config: RcloneConfig,
	remoteFileName?: string,
): Promise<void> {
	const { configContent, remotePath } = buildRcloneConfig(config);

	// Write config to a temp file
	const os = await import("node:os");
	const fs = await import("node:fs");
	const tmpDir = os.tmpdir();
	const configFilePath = path.join(
		tmpDir,
		`rclone-${Date.now()}-${Math.random().toString(36).slice(2)}.conf`,
	);

	try {
		fs.writeFileSync(configFilePath, configContent, { mode: 0o600 });

		const destFileName =
			remoteFileName ?? path.basename(localFilePath);
		const fullRemotePath = `${remotePath}/${destFileName}`;

		const result = spawnSync(
			"rclone",
			[
				"copyto",
				localFilePath,
				fullRemotePath,
				"--config",
				configFilePath,
				"--no-traverse",
			],
			{ encoding: "utf-8" },
		);

		if (result.status !== 0) {
			throw new Error(
				`rclone upload failed: ${result.stderr || result.stdout || "unknown error"}`,
			);
		}
	} finally {
		try {
			const fs = await import("node:fs");
			fs.unlinkSync(configFilePath);
		} catch {
			// ignore cleanup errors
		}
	}
}

/**
 * Check whether rclone is available in PATH.
 */
export function isRcloneAvailable(): boolean {
	try {
		execSync("rclone version", { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
}