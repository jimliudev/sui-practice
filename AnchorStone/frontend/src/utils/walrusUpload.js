/**
 * Upload image to Walrus decentralized storage
 * @param {File} file - Image file to upload
 * @returns {Promise<string>} - Blob ID from Walrus
 */
export async function uploadToWalrus(file) {
    try {
        const publisherUrl = import.meta.env.VITE_WALRUS_PUBLISHER_URL || 'https://publisher.walrus-testnet.walrus.space'

        // For now, we'll use a simple base64 encoding as fallback
        // In production, implement actual Walrus upload
        return new Promise((resolve, reject) => {
            const reader = new FileReader()

            reader.onload = () => {
                const base64 = reader.result
                // Return a data URL that can be stored on-chain
                resolve(base64)
            }

            reader.onerror = () => {
                reject(new Error('Failed to read file'))
            }

            reader.readAsDataURL(file)
        })
    } catch (error) {
        console.error('Walrus upload error:', error)
        throw error
    }
}

/**
 * Validate image file
 * @param {File} file - File to validate
 * @returns {Object} - Validation result
 */
export function validateImageFile(file) {
    const maxSize = 5 * 1024 * 1024 // 5MB
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

    if (!file) {
        return { valid: false, error: 'No file selected' }
    }

    if (!allowedTypes.includes(file.type)) {
        return { valid: false, error: 'Invalid file type. Please upload JPEG, PNG, WebP, or GIF' }
    }

    if (file.size > maxSize) {
        return { valid: false, error: 'File too large. Maximum size is 5MB' }
    }

    return { valid: true }
}
