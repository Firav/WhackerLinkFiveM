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
*/

function simulatePacketLoss(audioBuffer, lossProbability) {
    const audio = new Int16Array(audioBuffer);
    for (let i = 0; i < audio.length; i++) {
        if (Math.random() < lossProbability) {
            audio[i] = 0;
        }
    }
    return audio.buffer;
}

function addStaticNoise(audioBuffer, noiseLevel) {
    const audio = new Int16Array(audioBuffer);
    for (let i = 0; i < audio.length; i++) {
        audio[i] += Math.floor(Math.random() * noiseLevel - noiseLevel / 2);
    }
    return audio.buffer;
}

function applyInputGain(audioBuffer, gainMultiplier) {
    if (!gainMultiplier || gainMultiplier === 1.0) {
        return audioBuffer;
    }
    
    const audio = new Int16Array(audioBuffer);

    // Continuous soft clip: samples up to 80% of full scale pass through
    // untouched (same as before), anything above the knee rolls off smoothly
    // with a tanh curve and never exceeds full scale. Loud boosted audio
    // (QC2 tones, hot voice) stays sine shaped instead of flattening into a
    // square wave style hard clip, and quiet audio keeps the exact level it
    // had before.
    const SOFT_KNEE = 0.8;

    for (let i = 0; i < audio.length; i++) {
        const sample = audio[i] * gainMultiplier;
        
        if (sample > SOFT_KNEE * 32767 || sample < -SOFT_KNEE * 32767) {
            const sign = sample < 0 ? -1 : 1;
            const normalized = Math.abs(sample) / 32767;
            
            // tanh rolloff that is continuous at the knee and ceilings at 1.0
            const softLimit = SOFT_KNEE + (1 - SOFT_KNEE) * Math.tanh((normalized - SOFT_KNEE) / (1 - SOFT_KNEE));
            
            audio[i] = Math.round(sign * Math.min(softLimit, 1.0) * 32767);
        } else {
            audio[i] = Math.round(sample);
        }
    }
    return audio.buffer;
}

function insertDropouts(audioBuffer, gapLength, gapFrequency) {
    const audio = new Int16Array(audioBuffer);
    for (let i = 0; i < audio.length; i += gapLength) {
        if (Math.random() < gapFrequency) {
            audio.fill(0, i, Math.min(i + gapLength, audio.length));
        }
    }
    return audio.buffer;
}

function reduceBitDepth(audioBuffer, bits) {
    const audio = new Int16Array(audioBuffer);
    const mask = (1 << bits) - 1;
    for (let i = 0; i < audio.length; i++) {
        audio[i] = audio[i] & mask;
    }
    return audio.buffer;
}

function modulateFrequency(audioBuffer, sampleRate, modulationFrequency, depth) {
    const audio = new Int16Array(audioBuffer);
    const modIncrement = (2 * Math.PI * modulationFrequency) / sampleRate;
    let modPhase = 0;

    for (let i = 0; i < audio.length; i++) {
        audio[i] = audio[i] * (1 + depth * Math.sin(modPhase));
        modPhase += modIncrement;
        if (modPhase > 2 * Math.PI) modPhase -= 2 * Math.PI;
    }
    return audio.buffer;
}

function applyClipping(audioBuffer, threshold) {
    const audio = new Int16Array(audioBuffer);
    for (let i = 0; i < audio.length; i++) {
        if (audio[i] > threshold) audio[i] = threshold;
        else if (audio[i] < -threshold) audio[i] = -threshold;
    }
    return audio.buffer;
}

function simulateFringeCoverage(audioBuffer, sampleRate) {
    let buffer = new Int16Array(audioBuffer);

    buffer = new Int16Array(simulatePacketLoss(buffer.buffer, 0.60));
    buffer = new Int16Array(insertDropouts(buffer.buffer, 200, 0.50));

    return buffer;
}
