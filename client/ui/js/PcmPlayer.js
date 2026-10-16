/*
 * Copyright 2017 samirkumardas
 *
 * Use of this source code is governed by an MIT-style
 * license that can be found in the LICENSE file or at
 * https://opensource.org/licenses/MIT.
*/
/*
* WhackerLink - WhackerLinkFiveM
*
* This program is free software: you can redistribute it and/or modify
* it under the terms of the GNU General Public License as published by
* the Free Software Foundation, either version 3 of the License, or
* (at your option) any later version.
*
* This program is distributed in the hope that it will be useful,
* but WITHOUT ANY WARRANTY; without even the implied warranty of
* MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
* GNU General Public License for more details.
*
* You should have received a copy of the GNU General Public License
* along with this program.  If not, see <http://www.gnu.org/licenses/>.
*
* Copyright (C) 2024 Caleb, K4PHP
*
* Derived from https://github.com/samirkumardas/pcm-player/
*
*/

function PCMPlayer(option) {
    this.init(option);
}

PCMPlayer.prototype.init = function(option) {
    var defaults = {
        encoding: '16bitInt',
        channels: 1,
        sampleRate: 8000,
        flushingTime: 500
    };
    this.option = Object.assign({}, defaults, option);
    this.samples = new Float32Array();
    this.flush = this.flush.bind(this);
    this.interval = setInterval(this.flush, this.option.flushingTime);
    this.maxValue = this.getMaxValue();
    this.typedArray = this.getTypedArray();
    this.currentVolume = 0.6;
    this.outputGain = 1.0;
    this.limiterEnabled = false;
    this.createContext();
};

PCMPlayer.prototype.getMaxValue = function () {
    var encodings = {
        '8bitInt': 128,
        '16bitInt': 32768,
        '32bitInt': 2147483648,
        '32bitFloat': 1
    }

    return encodings[this.option.encoding] ? encodings[this.option.encoding] : encodings['16bitInt'];
};

PCMPlayer.prototype.getTypedArray = function () {
    var typedArrays = {
        '8bitInt': Int8Array,
        '16bitInt': Int16Array,
        '32bitInt': Int32Array,
        '32bitFloat': Float32Array
    }

    return typedArrays[this.option.encoding] ? typedArrays[this.option.encoding] : typedArrays['16bitInt'];
};

PCMPlayer.prototype.createContext = function() {
    this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    // context needs to be resumed on iOS and Safari (or it will stay in "suspended" state)
    this.audioCtx.resume();
    this.audioCtx.onstatechange = () => console.log(this.audioCtx.state);   // if you want to see "Running" state in console and be happy about it

    this.gainNode = this.audioCtx.createGain();
    this.gainNode.gain.value = 1;

    // Peak limiter chained between the gain node and the destination. It stays
    // in the graph permanently but in a fully transparent state (ratio 1,
    // threshold 0) so the default pipeline is unchanged; when the output gain
    // is boosted it engages and keeps loud signals (QC2 tones, hot voice)
    // from slamming into the destination clipper at full scale.
    this.limiterNode = this.audioCtx.createDynamicsCompressor();
    this.setLimiterEnabled(false);
    this.gainNode.connect(this.limiterNode);
    this.limiterNode.connect(this.audioCtx.destination);
    this.startTime = this.audioCtx.currentTime;
    //console.debug("Audio context created!!");
};

PCMPlayer.prototype.isTypedArray = function(data) {
    return (data.byteLength && data.buffer && data.buffer.constructor == ArrayBuffer);
};

PCMPlayer.prototype.feed = function(data) {
    if (!this.isTypedArray(data)){
        console.log("audio data is a not typed array; Data: " + data);
        return;
    }
    data = this.getFormatedValue(data);
    var tmp = new Float32Array(this.samples.length + data.length);
    tmp.set(this.samples, 0);
    tmp.set(data, this.samples.length);
    this.samples = tmp;
};

PCMPlayer.prototype.getFormatedValue = function(data) {
    var data = new this.typedArray(data.buffer),
        float32 = new Float32Array(data.length),
        i;

    for (i = 0; i < data.length; i++) {
        float32[i] = data[i] / this.maxValue;
    }
    return float32;
};

PCMPlayer.prototype.volume = function(volume) {
    if (volume < 0 || volume > 1) {
        console.warn("Volume should be between 0 and 1. Clamping value.");
        volume = Math.max(0, Math.min(1, volume));
    }
    
    // Apply both user volume and output gain if enabled
    const effectiveVolume = volume * (this.outputGain || 1.0);
    this.gainNode.gain.value = effectiveVolume;
    console.log("Volume set to:", volume, "with output gain:", this.outputGain, "effective:", effectiveVolume);
};

PCMPlayer.prototype.setLimiterEnabled = function(enabled) {
    this.limiterEnabled = !!enabled;

    if (!this.limiterNode) {
        return;
    }

    if (this.limiterEnabled) {
        // Brickwall style limiter: whatever the output gain pushes above
        // -6 dBFS is pulled back down, audio below the threshold keeps the
        // full boost so quiet systems still benefit from the extra gain
        this.limiterNode.threshold.value = -6;
        this.limiterNode.knee.value = 3;
        this.limiterNode.ratio.value = 20;
        this.limiterNode.attack.value = 0.002;
        this.limiterNode.release.value = 0.15;
    } else {
        // Transparent passthrough, identical to a plain gain node
        this.limiterNode.threshold.value = 0;
        this.limiterNode.knee.value = 0;
        this.limiterNode.ratio.value = 1;
        this.limiterNode.attack.value = 0.003;
        this.limiterNode.release.value = 0.25;
    }
};

PCMPlayer.prototype.setOutputGain = function(outputGain) {
    if (typeof outputGain !== 'number' || outputGain < 0) {
        console.warn("Output gain should be a positive number. Using 1.0");
        outputGain = 1.0;
    }
    this.outputGain = outputGain;

    // Any boosted output gain engages the receive limiter so loud boosted
    // signals (full scale QC2 tones from the console) stay well below full
    // scale instead of running the output into clipping. At 1.0 or below the
    // limiter is fully transparent and the old pipeline is preserved.
    const limiterShouldBeEngaged = outputGain > 1.0;

    if (this.limiterEnabled !== limiterShouldBeEngaged) {
        this.setLimiterEnabled(limiterShouldBeEngaged);
        console.log("Receive peak limiter " + (this.limiterEnabled ? "engaged" : "bypassed") + " (output gain:", outputGain, ")");
    }

    // Re-apply current volume to incorporate the new gain
    this.volume(this.currentVolume || 1.0);
};

PCMPlayer.prototype.destroy = function() {
    if (this.interval) {
        clearInterval(this.interval);
    }
    this.samples = null;
    this.audioCtx.close();
    this.audioCtx = null;
};

PCMPlayer.prototype.flush = function() {
    if (!this.samples.length) return;

    var bufferSource = this.audioCtx.createBufferSource(),
        length = Math.floor(this.samples.length / this.option.channels),
        audioBuffer = this.audioCtx.createBuffer(this.option.channels, length, this.option.sampleRate),
        audioData,
        channel,
        offset,
        i;

    for (channel = 0; channel < this.option.channels; channel++) {
        audioData = audioBuffer.getChannelData(channel);
        offset = channel;
        for (i = 0; i < length; i++) {
            audioData[i] = this.samples[offset];
            offset += this.option.channels;
        }
    }

    if (this.startTime < this.audioCtx.currentTime) {
        console.warn(`Adjusting startTime: ${this.startTime} -> ${this.audioCtx.currentTime}`);
        this.startTime = this.audioCtx.currentTime;
    }

    bufferSource.buffer = audioBuffer;
    bufferSource.connect(this.gainNode);
    bufferSource.start(this.startTime);
    this.startTime += audioBuffer.duration;

    // Carry over excess samples
    const excessSamples = this.samples.slice(length * this.option.channels);
    this.samples = new Float32Array(excessSamples.length);
    this.samples.set(excessSamples);
};

PCMPlayer.prototype.clear = function() {
    // console.log("Clearing audio buffer and resetting state...");
    this.samples = new Float32Array();
    if (this.audioCtx) {
        this.startTime = this.audioCtx.currentTime;
    }
};