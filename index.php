<?php

require 'vendor/autoload.php';

use Aws\S3\S3Client;
use Aws\S3\MultipartUploader;
use Aws\Exception\MultipartUploadException;
use Aws\Exception\AwsException;

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

$bucketName = "test.zerops.example.com";

try {
    $result = $s3Client->createBucket([
        'Bucket' => $bucketName,
    ]);
    return 'The bucket\'s location is: ' .
        $result['Location'] . '. ' .
        'The bucket\'s effective URI is: ' . 
        $result['@metadata']['effectiveUri'];
} catch (AwsException $e) {
    return 'Error: ' . $e->getAwsErrorMessage();
}

// Use multipart upload
$source = 'file.zip';
$uploader = new MultipartUploader($s3Client, $source, [
    'bucket' => 'your-bucket',
    'key' => 'file.zip',
]);

try {
    $result = $uploader->upload();
    echo "Upload complete: {$result['ObjectURL']}\n";
} catch (MultipartUploadException $e) {
    echo $e->getMessage() . "\n";
}

?>