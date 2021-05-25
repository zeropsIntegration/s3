<?php

require 'vendor/autoload.php';

use Aws\S3\S3Client;
use Aws\S3\MultipartUploader;
use Aws\Exception\MultipartUploadException;
use Aws\Exception\AwsException;

echo "1";

try {
 	$s3Client = new S3Client([
		'endpoint' => 'https://s3.app.zerops.dev',
		'region' => 'us-east-1',
		'version' => 'latest',
		'signature_version' => 'v4',
		'credentials' => [
			'key' => $_SERVER["accessKeyId"],
			'secret' => $_SERVER["secretAccessKey"],
		],
	]);
} catch (AwsException $e) {
	return 'Error: ' . $e->getAwsErrorMessage();
}


$bucketName = "test2.zerops.example.com";


echo "2";

try {
	$result = $s3Client->createBucket([
		'Bucket' => $bucketName,
	]);
} catch (AwsException $e) {
	return 'Error: ' . $e->getAwsErrorMessage();
}

// Use multipart upload

$source = 'file.zip';
$uploader = new MultipartUploader($s3Client, $source, [
	'bucket' => $bucketName,
	'key' => uniqid(rand(), true) . '.zip',
]);


echo "3";

try {
	$result = $uploader->upload();
	echo "Upload complete: {$result['ObjectURL']}\n";
} catch (MultipartUploadException $e) {
	echo $e->getMessage() . "\n";
}

?>
