import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useSuiTransaction } from '../hooks/useSuiTransaction'
import { buildMintNFTTransaction, parseTransactionResult } from '../utils/contractInteraction'
import { uploadToWalrus, validateImageFile } from '../utils/walrusUpload'
import './PropertyForm.css'

export default function PropertyForm({ userAddress, onLogout }) {
    const { register, handleSubmit, formState: { errors }, watch } = useForm({
        defaultValues: {
            name: '',
            description: '',
            propertyValue: '',
            location: '',
            tokenSupply: 100000,
            reserveAmount: 1000,
        }
    })

    const [imageFile, setImageFile] = useState(null)
    const [imagePreview, setImagePreview] = useState(null)
    const [imageError, setImageError] = useState(null)
    const [isUploading, setIsUploading] = useState(false)

    const { executeTransaction, status, txDigest, error, reset } = useSuiTransaction()

    const handleImageChange = (e) => {
        const file = e.target.files[0]
        if (!file) return

        const validation = validateImageFile(file)
        if (!validation.valid) {
            setImageError(validation.error)
            setImageFile(null)
            setImagePreview(null)
            return
        }

        setImageError(null)
        setImageFile(file)

        // Create preview
        const reader = new FileReader()
        reader.onloadend = () => {
            setImagePreview(reader.result)
        }
        reader.readAsDataURL(file)
    }

    const onSubmit = async (data) => {
        if (!imageFile) {
            setImageError('Please select an image')
            return
        }

        try {
            setIsUploading(true)

            // Upload image to Walrus
            const imageUrl = await uploadToWalrus(imageFile)

            // Build transaction
            const tx = buildMintNFTTransaction({
                name: data.name,
                description: data.description,
                imageUrl,
                propertyValue: parseFloat(data.propertyValue),
                location: data.location,
            })

            // Execute transaction
            const result = await executeTransaction(tx)

            // Parse result to get NFT ID
            const { nftId } = parseTransactionResult(result)

            console.log('NFT minted successfully:', nftId)
            console.log('Transaction digest:', result.digest)

        } catch (err) {
            console.error('Submission error:', err)
        } finally {
            setIsUploading(false)
        }
    }

    const handleReset = () => {
        reset()
        setImageFile(null)
        setImagePreview(null)
        setImageError(null)
    }

    return (
        <div className="property-form-container">
            <div className="property-form-header">
                <div>
                    <h1 className="form-title">
                        <span className="title-gradient">Create Property NFT</span>
                    </h1>
                    <p className="form-subtitle">Tokenize your real-world asset</p>
                </div>

                <div className="header-actions">
                    <div className="user-address">
                        <span className="address-label">Connected:</span>
                        <code className="address-value">{userAddress?.slice(0, 6)}...{userAddress?.slice(-4)}</code>
                    </div>
                    <button className="btn btn-secondary" onClick={onLogout}>
                        Disconnect
                    </button>
                </div>
            </div>

            <div className="form-content">
                <form onSubmit={handleSubmit(onSubmit)} className="property-form">
                    <div className="form-grid">
                        {/* Left Column - Property Details */}
                        <div className="form-column">
                            <div className="form-group">
                                <label className="form-label">Property Name *</label>
                                <input
                                    type="text"
                                    className="input"
                                    placeholder="e.g., Taipei Premium Suite A1"
                                    {...register('name', { required: 'Property name is required' })}
                                />
                                {errors.name && <p className="form-error">{errors.name.message}</p>}
                            </div>

                            <div className="form-group">
                                <label className="form-label">Description *</label>
                                <textarea
                                    className="textarea"
                                    placeholder="Describe your property..."
                                    {...register('description', { required: 'Description is required' })}
                                />
                                {errors.description && <p className="form-error">{errors.description.message}</p>}
                            </div>

                            <div className="form-group">
                                <label className="form-label">Property Value (USDC) *</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    className="input"
                                    placeholder="10000"
                                    {...register('propertyValue', {
                                        required: 'Property value is required',
                                        min: { value: 0.01, message: 'Value must be greater than 0' }
                                    })}
                                />
                                {errors.propertyValue && <p className="form-error">{errors.propertyValue.message}</p>}
                            </div>

                            <div className="form-group">
                                <label className="form-label">Location *</label>
                                <input
                                    type="text"
                                    className="input"
                                    placeholder="e.g., Taipei, Taiwan"
                                    {...register('location', { required: 'Location is required' })}
                                />
                                {errors.location && <p className="form-error">{errors.location.message}</p>}
                            </div>
                        </div>

                        {/* Right Column - Image & Token Settings */}
                        <div className="form-column">
                            <div className="form-group">
                                <label className="form-label">Property Image *</label>
                                <div className="image-upload-area">
                                    {imagePreview ? (
                                        <div className="image-preview-container">
                                            <img src={imagePreview} alt="Preview" className="image-preview" />
                                            <button
                                                type="button"
                                                className="btn btn-secondary btn-sm remove-image-btn"
                                                onClick={() => {
                                                    setImageFile(null)
                                                    setImagePreview(null)
                                                }}
                                            >
                                                Remove
                                            </button>
                                        </div>
                                    ) : (
                                        <label className="image-upload-label">
                                            <input
                                                type="file"
                                                accept="image/*"
                                                onChange={handleImageChange}
                                                className="image-input"
                                            />
                                            <div className="upload-placeholder">
                                                <svg className="upload-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                                </svg>
                                                <p>Click to upload image</p>
                                                <p className="text-muted">PNG, JPG, WebP up to 5MB</p>
                                            </div>
                                        </label>
                                    )}
                                </div>
                                {imageError && <p className="form-error">{imageError}</p>}
                            </div>

                            <div className="form-group">
                                <label className="form-label">Token Supply</label>
                                <input
                                    type="number"
                                    className="input"
                                    {...register('tokenSupply', {
                                        required: 'Token supply is required',
                                        min: { value: 1, message: 'Must be at least 1' }
                                    })}
                                />
                                <p className="text-muted mt-1">Total fractional tokens to create</p>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Reserve Amount (USDC)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    className="input"
                                    {...register('reserveAmount', {
                                        required: 'Reserve amount is required',
                                        min: { value: 0, message: 'Must be at least 0' }
                                    })}
                                />
                                <p className="text-muted mt-1">Collateral for market making + liquidation</p>
                            </div>
                        </div>
                    </div>

                    {/* Transaction Status */}
                    {status !== 'idle' && (
                        <div className={`transaction-status status-${status}`}>
                            {status === 'pending' && (
                                <div className="status-content">
                                    <div className="spinner"></div>
                                    <p>
                                        {isUploading ? 'Uploading image...' : 'Creating NFT on blockchain...'}
                                    </p>
                                </div>
                            )}

                            {status === 'success' && (
                                <div className="status-content">
                                    <svg className="status-icon success-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                    <div>
                                        <p className="status-title">NFT Created Successfully!</p>
                                        <p className="text-muted">Transaction: {txDigest?.slice(0, 8)}...{txDigest?.slice(-6)}</p>
                                    </div>
                                </div>
                            )}

                            {status === 'error' && (
                                <div className="status-content">
                                    <svg className="status-icon error-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                    <div>
                                        <p className="status-title">Transaction Failed</p>
                                        <p className="text-muted">{error}</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Form Actions */}
                    <div className="form-actions">
                        {status === 'success' ? (
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={handleReset}
                            >
                                Create Another Property
                            </button>
                        ) : (
                            <>
                                <button
                                    type="submit"
                                    className="btn btn-primary"
                                    disabled={status === 'pending' || isUploading}
                                >
                                    {status === 'pending' || isUploading ? 'Processing...' : 'Create Property NFT'}
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={handleReset}
                                    disabled={status === 'pending' || isUploading}
                                >
                                    Reset
                                </button>
                            </>
                        )}
                    </div>
                </form>
            </div>
        </div>
    )
}
