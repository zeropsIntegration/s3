function S3MultiUpload(file) {
    this.PART_SIZE = 22 * 1024 * 1024;
    this.SERVER_LOC = '?'; // Location of the server
    this.completed = false;
    this.file = file;
    this.fileInfo = {
        name: this.file.name,
        type: this.file.type,
        size: this.file.size,
        lastModifiedDate: this.file.lastModifiedDate
    };
    this.sendBackData = null;
    this.uploadXHR = [];
    // Progress monitoring
    this.byterate = []
    this.lastUploadedSize = []
    this.lastUploadedTime = []
    this.loaded = [];
    this.total = [];
    this.parts = []; // pre-partsCompleted parts
    this.partsCompleted = [false];
    this.partsInProgress = [false];
}

Array.prototype.remove = function() {
    var what, a = arguments, L = a.length, ax;
    while (L && this.length) {
        what = a[--L];
        while ((ax = this.indexOf(what)) !== -1) {
            this.splice(ax, 1);
        }
    }
    return this;
};

/**
 * Creates the multipart upload
 */
S3MultiUpload.prototype.createMultipartUpload = function() {
    var self = this;
    $.post(self.SERVER_LOC, {
        command: 'create',
        fileInfo: self.fileInfo,
        key: self.file.lastModified + self.file.name
    }).done(function(data) {
        self.sendBackData = data;
        document.getElementById("uploadId").value = self.sendBackData.uploadId;
        console.log(self.sendBackData.uploadId)
        console.log(self.sendBackData.key)
        self.uploadParts();
    }).fail(function(jqXHR, textStatus, errorThrown) {
        self.onServerError('create', jqXHR, textStatus, errorThrown);
    });
};


/** private */
S3MultiUpload.prototype.resumeMultipartUpload = function(uploadId) {
    var self = this;
    self.sendBackData = {
        uploadId: uploadId,
        key: self.file.lastModified + self.file.name
    };

    $.post(self.SERVER_LOC, {
        command: 'listparts',
        sendBackData: self.sendBackData
    }).done(function(data) {
        
        if (data.parts) {
            var parts = data.parts
            console.log(parts)
        }

        for (var i = 0; i < parts.length; i++) {
            self.loaded[parts[i].PartNumber] = parts[i].Size
            self.total[parts[i].PartNumber] = parts[i].Size
            self.partsCompleted[parts[i].PartNumber] = true
        }

        self.uploadParts();

    }).fail(function(jqXHR, textStatus, errorThrown) {
        self.onServerError('listparts', jqXHR, textStatus, errorThrown);
    });
};

/** private */
S3MultiUpload.prototype.uploadParts = function() {
    var blobs = this.blobs = [], promises = [];
    var partNumbers = this.partNumbers = []
    var start = 0;
    var end, blob;
    var partNum = 0;


    while(start < this.file.size) {
        end = Math.min(start + this.PART_SIZE, this.file.size);
		filePart = this.file.slice(start, end);
        
        // this is to prevent push blob with 0Kb
        if (filePart.size > 0) {
            this.partsInProgress.push(false)
            partNumbers.push(partNum+1)
        }

        if (filePart.size > 0 && !this.partsCompleted[partNum+1]) {
            
            blobs.push(filePart);

            //console.log('Getting presigned URL for part ' + (partNum+1))
            promises.push(this.uploadXHR[filePart]=$.post(this.SERVER_LOC, {
                command: 'part',
                sendBackData: this.sendBackData,
                partNumber: partNum+1,
                contentLength: filePart.size
            }));

        }
        start = this.PART_SIZE * ++partNum;
    }
    $.when.apply(null, promises)
     .then(this.sendAll.bind(this), this.onServerError)
     .done(this.onPrepareCompleted);

     console.log(this.partsInProgress)
     console.log(this.partNumbers)
};

/**
 * Sends all the created upload parts in a loop
 */
S3MultiUpload.prototype.sendAll = function() {
    var blobs = this.blobs;
    var length = blobs.length;
    var data = Array.from(arguments)

    if (length==1) {
        //console.log("Sending object")
        this.sendToS3(data[0], blobs[0], 0, 1);
    } else {
        for (var i = 0; i < length; i++) {
            //console.log("Sending part " + this.partNumbers[i])
            this.sendToS3(data[i][0], blobs[i], i, this.partNumbers[i]);
        }
    }
};
/**
 * Used to send each uploadPart
 * @param  array data  parameters of the part
 * @param  blob blob  data bytes
 * @param  integer index part index (base zero)
 */
S3MultiUpload.prototype.sendToS3 = function(data, blob, index, partNumber) {
    var self = this;
    var url = data['url'];
    var size = blob.size;
    var request = self.uploadXHR[index] = new XMLHttpRequest();
    request.onreadystatechange = function() {
        if (request.readyState === 4) { // 4 is DONE
            // self.uploadXHR[index] = null;
            if (request.status !== 200) {
                self.updateProgress();
                self.onS3UploadError(request);
                return;
            }
            console.log('Finished part '+partNumber)
            self.partsCompleted[partNumber] = true
            self.partsInProgress[partNumber] = false
            self.updateProgress();
        }
    };

    request.upload.onprogress = function(e) {

        if (e.lengthComputable) {

            if (!self.partsInProgress[partNumber]) {
                    self.partsInProgress[partNumber] = true
            }

            self.total[partNumber] = size;
            self.loaded[partNumber] = e.loaded;
            if (self.lastUploadedTime[partNumber])
            {
                var time_diff=(new Date().getTime() - self.lastUploadedTime[partNumber])/1000;
                if (time_diff > 0.005) // 5 miliseconds has passed
                {
                    var byterate=(self.loaded[partNumber] - self.lastUploadedSize[partNumber])/time_diff;
                    self.byterate[partNumber] = byterate; 
                    self.lastUploadedTime[partNumber]=new Date().getTime();
                    self.lastUploadedSize[partNumber]=self.loaded[partNumber];
                }
            }
            else 
            {
                self.byterate[partNumber] = 0; 
                self.lastUploadedTime[partNumber]=new Date().getTime();
                self.lastUploadedSize[partNumber]=self.loaded[partNumber];
            }
            // Only send update to user once, regardless of how many
            // parallel XHRs we have (unless the first one is over).
            if (index==0 || self.total[0]==self.loaded[0]) {
                self.updateProgress();
            }
        }
    };
    request.open('PUT', url, true);
    request.send(blob);
};

/**
 * Abort multipart upload
 */
S3MultiUpload.prototype.cancel = function() {
    var self = this;
    for (var i=0; i<this.uploadXHR.length; ++i) {
        this.uploadXHR[i].abort();
    }
    $.post(self.SERVER_LOC, {
        command: 'abort',
        sendBackData: self.sendBackData
    }).done(function(data) {

    });
};

/**
 * Complete multipart upload
 */
S3MultiUpload.prototype.completeMultipartUpload = function() {
    var self = this;
    if (this.completed) return;
    this.completed=true;
    $.post(self.SERVER_LOC, {
        command: 'complete',
        sendBackData: self.sendBackData
    }).done(function(data) {
        self.onUploadCompleted(data);
    }).fail(function(jqXHR, textStatus, errorThrown) {
        self.onServerError('complete', jqXHR, textStatus, errorThrown);
    });
};

/**
 * Track progress, propagate event, and check for completion
 */
S3MultiUpload.prototype.updateProgress = function() {
    var total=0;
    var loaded=0;
    var byterate=0.0;
    var complete=1;
    for (var i=0; i<this.total.length; ++i) {
        loaded += +this.loaded[i] || 0;
        total += this.total[i];
        if (this.loaded[i]!=this.total[i])
        {
            // Only count byterate for active transfers
            byterate += +this.byterate[i] || 0;
            complete=0;
        }
    }
    if (complete) {
        this.completeMultipartUpload();
    }
    total=this.fileInfo.size;
    this.onProgressChanged(loaded, total, byterate, this.partsInProgress, this.partsCompleted);
};

// Overridable events: 

/**
 * Overrride this function to catch errors occured when communicating to your server
 *
 * @param {type} command Name of the command which failed,one of 'CreateMultipartUpload', 'SignUploadPart','CompleteMultipartUpload'
 * @param {type} jqXHR jQuery XHR
 * @param {type} textStatus resonse text status
 * @param {type} errorThrown the error thrown by the server
 */
S3MultiUpload.prototype.onServerError = function(command, jqXHR, textStatus, errorThrown) {};

/**
 * Overrride this function to catch errors occured when uploading to S3
 *
 * @param XMLHttpRequest xhr the XMLHttpRequest object
 */
S3MultiUpload.prototype.onS3UploadError = function(xhr) {};

/**
 * Override this function to show user update progress
 *
 * @param {type} uploadedSize is the total uploaded bytes
 * @param {type} totalSize the total size of the uploading file
 * @param {type} speed bytes per second
 */
S3MultiUpload.prototype.onProgressChanged = function(uploadedSize, totalSize, bitrate, partsInProgress, partsCompleted) {};

/**
 * Override this method to execute something when upload finishes
 *
 */
S3MultiUpload.prototype.onUploadCompleted = function(serverData) {};
/**
 * Override this method to execute something when part preparation is completed
 *
 */
S3MultiUpload.prototype.onPrepareCompleted = function() {};
