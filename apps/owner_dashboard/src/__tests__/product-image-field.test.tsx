import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  ProductImageField,
  validateAndCompressProductImage,
  MAX_IMAGE_FILE_SIZE_BYTES,
} from "@/features/catalog/product-image-field";

describe("ProductImageField — security & format validation (S3)", () => {
  it("rejects non-allowlisted MIME types (SVG, PDF, text)", async () => {
    const invalidFile = new File(["<svg></svg>"], "test.svg", {
      type: "image/svg+xml",
    });

    await expect(validateAndCompressProductImage(invalidFile)).rejects.toThrow(
      /Formato no permitido/i,
    );
  });

  it("rejects files exceeding the 2 MB maximum size threshold", async () => {
    const largeContent = new Uint8Array(MAX_IMAGE_FILE_SIZE_BYTES + 1024);
    const largeFile = new File([largeContent], "huge.jpg", {
      type: "image/jpeg",
    });

    await expect(validateAndCompressProductImage(largeFile)).rejects.toThrow(
      /El archivo es muy pesado/i,
    );
  });

  it("renders empty placeholder when no image value is provided", () => {
    const onChange = vi.fn();
    render(<ProductImageField value={null} onChange={onChange} />);

    expect(screen.getByText(/Subir foto/i)).toBeInTheDocument();
    expect(screen.queryByTestId("product-image-preview")).not.toBeInTheDocument();
    expect(screen.queryByTestId("remove-product-image-button")).not.toBeInTheDocument();
  });

  it("renders preview and remove button when image value is provided", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(
      <ProductImageField
        value="data:image/webp;base64,mockValidData"
        onChange={onChange}
      />,
    );

    const preview = screen.getByTestId("product-image-preview");
    expect(preview).toBeInTheDocument();
    expect(preview).toHaveAttribute("src", "data:image/webp;base64,mockValidData");

    const removeBtn = screen.getByTestId("remove-product-image-button");
    expect(removeBtn).toBeInTheDocument();

    await user.click(removeBtn);
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
